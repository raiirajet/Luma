package ch.luma.auto

import org.json.JSONObject
import java.io.ByteArrayOutputStream
import java.math.BigDecimal
import java.math.RoundingMode
import java.net.HttpURLConnection
import java.net.URI
import java.time.LocalDate
import java.util.Currency

internal data class OfficialImportDestination(
    val currency: String,
    val vatRate: Double,
    val vatSource: String,
    val customsSource: String,
    val customsZero: Boolean,
    val customsStandardRate: Double?,
    val vehicleTaxRate: Double?,
    val vehicleTaxSource: String?,
    val extraSource: String?,
    val fxSource: String?,
    val isEu: Boolean
) {
    fun hasNoCustoms(euCirculation: Boolean): Boolean = customsZero || (isEu && euCirculation)
}

internal data class OfficialImportCatalog(
    val verifiedOn: LocalDate,
    val destinations: Map<String, OfficialImportDestination>
) {
    companion object {
        private const val CATALOG_URL =
            "https://limba-auto.web.app/shared/borderless/official-import-data.json"
        private const val MAX_BYTES = 64 * 1024

        fun parse(text: String, countries: Set<String>): OfficialImportCatalog {
            val document = JSONObject(text)
            require(document.optInt("schemaVersion") == 1)
            val date = LocalDate.parse(document.getString("verifiedOn"))
            val entries = document.getJSONObject("destinations")
            val destinations = countries.associateWith { country ->
                val entry = entries.getJSONObject(country)
                val currency = Currency.getInstance(entry.getString("currency")).currencyCode
                val vehicleTax = entry.optionalRate("vehicleTaxRate")
                val vehicleSource = entry.optionalSource("vehicleTaxSource")
                require(vehicleTax == null || vehicleSource != null)
                OfficialImportDestination(
                    currency = currency,
                    vatRate = requireNotNull(entry.optionalRate("vatRate")),
                    vatSource = requireNotNull(entry.optionalSource("vatSource")),
                    customsSource = requireNotNull(entry.optionalSource("customsSource")),
                    customsZero = entry.opt("customsZero") == true,
                    customsStandardRate = entry.optionalRate("customsStandardRate"),
                    vehicleTaxRate = vehicleTax,
                    vehicleTaxSource = vehicleSource,
                    extraSource = entry.optionalSource("extraSource"),
                    fxSource = entry.optionalSource("fxSource"),
                    isEu = entry.get("isEu") as Boolean
                )
            }
            return OfficialImportCatalog(date, destinations)
        }

        fun download(countries: Set<String>): OfficialImportCatalog {
            val connection = URI(CATALOG_URL).toURL().openConnection() as HttpURLConnection
            return try {
                connection.connectTimeout = 5000
                connection.readTimeout = 5000
                connection.instanceFollowRedirects = false
                check(connection.responseCode == HttpURLConnection.HTTP_OK)
                val data = connection.inputStream.use { input ->
                    val output = ByteArrayOutputStream()
                    val buffer = ByteArray(4096)
                    while (true) {
                        val count = input.read(buffer)
                        if (count < 0) break
                        require(output.size() + count <= MAX_BYTES)
                        output.write(buffer, 0, count)
                    }
                    output.toString(Charsets.UTF_8.name())
                }
                parse(data, countries)
            } finally {
                connection.disconnect()
            }
        }

        private fun JSONObject.optionalRate(key: String): Double? {
            if (!has(key) || isNull(key)) return null
            val value = (get(key) as Number).toDouble()
            require(value.isFinite() && value in 0.0..100.0)
            return value
        }

        private fun JSONObject.optionalSource(key: String): String? {
            if (!has(key) || isNull(key)) return null
            val source = getString(key)
            val uri = URI(source)
            require(uri.scheme == "https" && !uri.host.isNullOrBlank() && uri.userInfo == null)
            return source
        }
    }
}

internal data class OfficialImportInput(
    val price: Double?,
    val transport: Double?,
    val customs: Double?,
    val customsBasis: Double?,
    val useCustomsRate: Boolean,
    val vatBasis: Double?,
    val vehicleTaxBasis: Double?,
    val otherCharges: Double?,
    val registration: Double?,
    val vatApplicable: Boolean?,
    val euCirculation: Boolean
)

internal data class OfficialImportEstimate(
    val amounts: Map<String, Double?>,
    val subtotal: Double,
    val complete: Boolean
)

internal fun estimateOfficialImport(
    destination: OfficialImportDestination,
    input: OfficialImportInput
): OfficialImportEstimate {
    fun percentage(basis: Double?, rate: Double?): Double? {
        if (basis == null || rate == null) return null
        return BigDecimal.valueOf(basis).multiply(BigDecimal.valueOf(rate))
            .movePointLeft(2).setScale(2, RoundingMode.HALF_UP).toDouble()
    }

    val customs = when {
        input.customs != null -> input.customs
        destination.hasNoCustoms(input.euCirculation) -> 0.0
        input.useCustomsRate -> percentage(input.customsBasis, destination.customsStandardRate)
        else -> null
    }
    val vat = when (input.vatApplicable) {
        true -> percentage(input.vatBasis, destination.vatRate)
        false -> 0.0
        null -> null
    }
    val amounts = linkedMapOf(
        "listedPrice" to input.price,
        "transport" to input.transport,
        "customs" to customs,
        "officialVatAmount" to vat
    )
    destination.vehicleTaxRate?.let { amounts["officialVehicleTax"] = percentage(input.vehicleTaxBasis, it) }
    amounts["officialOtherCharges"] = input.otherCharges
    amounts["registration"] = input.registration
    val values = amounts.values.filterNotNull()
    val subtotal = values.fold(BigDecimal.ZERO) { sum, value -> sum.add(BigDecimal.valueOf(value)) }
        .setScale(2, RoundingMode.HALF_UP).toDouble()
    return OfficialImportEstimate(amounts, subtotal, values.size == amounts.size)
}
