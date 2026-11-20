package ch.luma.auto

import android.Manifest
import android.app.Activity
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.AlertDialog
import android.content.ActivityNotFoundException
import android.content.ClipData
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.BitmapFactory
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.net.Uri
import android.os.Bundle
import android.os.Build
import android.provider.MediaStore
import android.provider.Settings
import androidx.core.content.FileProvider
import android.view.WindowInsets
import android.content.res.ColorStateList
import android.view.Gravity
import android.view.KeyEvent
import android.view.MotionEvent
import android.view.View
import android.view.ViewGroup
import android.view.WindowManager
import android.widget.AdapterView
import android.widget.ArrayAdapter
import android.widget.AutoCompleteTextView
import android.widget.Button
import android.widget.CheckBox
import android.widget.EditText
import android.widget.FrameLayout
import android.widget.HorizontalScrollView
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.Spinner
import android.widget.TextView
import android.widget.Toast
import com.google.firebase.firestore.ListenerRegistration
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.text.Normalizer
import java.text.NumberFormat
import java.time.LocalDate
import java.util.Locale
import java.util.UUID
import javax.crypto.SecretKeyFactory
import javax.crypto.spec.PBEKeySpec
import java.security.SecureRandom
import java.security.MessageDigest
import android.text.Editable
import android.text.InputType
import android.text.TextWatcher

/**
 * Native Limba Auto marketplace with Firebase authentication.
 */
class MainActivity : Activity() {
    private val ink = Color.rgb(16, 43, 58)
    private val navy = Color.rgb(12, 40, 56)
    private val orange = Color.rgb(9, 101, 213)
    private val paper = Color.WHITE
    private val mist = Color.rgb(243, 247, 248)
    private val muted = Color.rgb(82, 105, 118)
    private val border = Color.rgb(218, 230, 234)
    private lateinit var root: FrameLayout
    private lateinit var messages: JSONObject
    private lateinit var releaseMessages: JSONObject
    private lateinit var brands: JSONObject
    private val catalogAccents = Regex("[\u0300-\u036f]")
    private val catalogSeparators = Regex("[\\s._’'\\-]+")
    private val brandAliases = mapOf(
        "mercedes" to "Mercedes-Benz", "vw" to "Volkswagen", "mini cooper" to "Mini",
        "landrover" to "Land Rover", "gtr" to "Nissan", "ssang yong" to "SsangYong"
    )
    private val canonicalBrands by lazy {
        val makes = brands.getJSONArray("makes")
        (0 until makes.length()).map(makes::getString).associateBy(::normalizeCatalogName)
    }
    private val prefs by lazy { getSharedPreferences("luma_native_v1", MODE_PRIVATE) }
    private var locale = "de"
    private var screen = "home"
    private val navigationHistory = java.util.ArrayDeque<String>()
    private var backFromDetail = "home"
    private var starred = false
    private val compareVehicleIds = linkedSetOf<String>()
    private var swipeSeen = false
    private var swipeGuideView: View? = null
    private var listingsLoaded = false
    private var priceCurrency = "EUR"
    private val exchangeRates = mutableMapOf("EUR" to 1.0)
    private var fxUpdated = ""
    private var activeCountry = mutableSetOf<String>()
    private var keyword = ""
    private var make = ""
    private var model = ""
    private var maxPrice = ""
    private var yearFrom = ""
    private var maxMileage = ""
    private var minMileage = ""
    private var yearTo = ""
    private var minPrice = ""
    private var minPower = ""
    private var maxPower = ""
    private var engineQuery = ""
    private var minCapacity = ""
    private var maxCapacity = ""
    private var sellerFilter = ""
    private var fuel = ""
    private var transmission = ""
    private var body = ""
    private var previewUser = ""
    private val previewCars = mutableListOf<JSONObject>()
    private val cloudCars = mutableListOf<JSONObject>()
    private val ownCars = mutableListOf<JSONObject>()
    private var cloudStars = mutableSetOf<String>()
    private var cloudUser: com.google.firebase.auth.FirebaseUser? = null
    private var countryRegistration: ListenerRegistration? = null
    private var dealerRegistration: ListenerRegistration? = null
    private var dealerApplication: JSONObject? = null
    private var submittingDealerApplication = false
    private var cloudSearches = emptyList<JSONObject>()
    private var searchAlerts = emptyList<JSONObject>()
    private var searchAlertsLoaded = false
    private var searchAlertsLoadFailed = false
    private var openingSellerChat = false
    private val searchRegistrations = mutableListOf<ListenerRegistration>()
    private var screenRegistration: ListenerRegistration? = null
    private var conversationDialog: AlertDialog? = null
    private lateinit var backend: LimbaFirebase
    private val pickedImages = mutableListOf<Uri>()
    private var pickedImagesLabel: TextView? = null
    private var renderPickedPhotoFields: (() -> Unit)? = null
    private var detailPhotoIndex = 0
    private val photoKinds = listOf("exterior", "interior", "odometer", "damage", "other")
    private val pickPhotosRequest = 1414
    private val takePhotoRequest = 1415
    private val cameraPermissionRequest = 1416
    private val notificationPermissionRequest = 1417
    private val stagedCameraFiles = mutableSetOf<File>()
    private var pendingCameraPhoto: File? = null
    private var deviceNotifications: ListenerRegistration? = null
    private var notificationOwner: String? = null
    private val notificationChannelId = "limba_search_matches"
    private val openNotificationsExtra = "ch.luma.auto.OPEN_NOTIFICATIONS"
    private var activePreviewCar: JSONObject? = null
    private var swipeIndex = 0
    private var previewStars = mutableSetOf<String>()
    private var carPhoto: android.graphics.Bitmap? = null
    private val countries = listOf(
        Triple("AL", "🇦🇱", "Albania"), Triple("TR", "🇹🇷", "Türkiye"),
        Triple("GR", "🇬🇷", "Greece"), Triple("RS", "🇷🇸", "Serbia"),
        Triple("SI", "🇸🇮", "Slovenia"), Triple("XK", "🇽🇰", "Kosovo"),
        Triple("MK", "🇲🇰", "North Macedonia"), Triple("HR", "🇭🇷", "Croatia"),
        Triple("BA", "🇧🇦", "Bosnia and Herzegovina"), Triple("ME", "🇲🇪", "Montenegro"),
        Triple("BG", "🇧🇬", "Bulgaria"), Triple("RO", "🇷🇴", "Romania")
    )
    private val codes = listOf("de", "en", "sq", "tr", "el", "sr-Latn", "sr-Cyrl", "sl", "hr", "mk", "bs", "cnr", "bg", "ro")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        window.clearFlags(WindowManager.LayoutParams.FLAG_FULLSCREEN)
        window.addFlags(WindowManager.LayoutParams.FLAG_DRAWS_SYSTEM_BAR_BACKGROUNDS)
        // Edge-to-edge visual layout, but never immersive: system status and gesture bars
        // remain visible and all touch targets stay inside the real safe area.
        if (Build.VERSION.SDK_INT >= 30) {
            window.setDecorFitsSystemWindows(false)
        } else {
            @Suppress("DEPRECATION")
            window.decorView.systemUiVisibility = View.SYSTEM_UI_FLAG_LAYOUT_STABLE or
                View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN or View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
        }
        window.statusBarColor = navy
        window.navigationBarColor = navy
        if (Build.VERSION.SDK_INT >= 29) {
            window.isStatusBarContrastEnforced = false
            window.isNavigationBarContrastEnforced = false
        }
        root = FrameLayout(this)
        root.setBackgroundColor(navy)
        root.setOnApplyWindowInsetsListener { view, insets ->
            if (Build.VERSION.SDK_INT >= 30) {
                val safe = insets.getInsets(WindowInsets.Type.systemBars() or WindowInsets.Type.displayCutout())
                view.setPadding(safe.left, safe.top, safe.right, safe.bottom)
            } else {
                @Suppress("DEPRECATION")
                view.setPadding(insets.systemWindowInsetLeft, insets.systemWindowInsetTop,
                    insets.systemWindowInsetRight, insets.systemWindowInsetBottom)
            }
            insets
        }
        setContentView(root)
        root.requestApplyInsets()
        messages = JSONObject(assets.open("i18n.json").bufferedReader().use { it.readText() })
        releaseMessages = JSONObject(assets.open("release-i18n.json").bufferedReader().use { it.readText() })
        brands = JSONObject(assets.open("brands.json").bufferedReader().use { it.readText() })
        locale = prefs.getString("language", "de") ?: "de"
        if (locale !in codes) locale = "de"
        starred = prefs.getBoolean("favorite", false)
        swipeSeen = prefs.getBoolean("swipeSeen", false)
        priceCurrency = prefs.getString("displayCurrency", "EUR").orEmpty().takeIf { it in listOf("EUR", "MKD", "ALL", "RSD", "CHF") } ?: "EUR"
        activeCountry = (prefs.getStringSet("countries", emptySet()) ?: emptySet()).toMutableSet()
        backend = LimbaFirebase(this)
        listingsLoaded = !backend.ready
        if (priceCurrency != "EUR") loadExchangeRates()
        if (BuildConfig.DEBUG && !backend.ready) {
            previewUser = prefs.getString("previewUser", "").orEmpty().takeUnless { it == "limba" }.orEmpty()
            val stored = runCatching { JSONArray(prefs.getString("previewCars", "[]")) }.getOrDefault(JSONArray())
            for (i in 0 until stored.length()) stored.optJSONObject(i)?.let { previewCars.add(it) }
            previewStars = prefs.getStringSet("previewStars", emptySet()).orEmpty().toMutableSet()
            runCatching { assets.open("gtr.jpg").use { carPhoto = BitmapFactory.decodeStream(it) } }
        } else {
            prefs.edit().remove("previewUser").apply()
        }
        val oldPhotoCutoff = System.currentTimeMillis() - 24 * 60 * 60 * 1000
        File(cacheDir, "listing-photos").listFiles()?.filter { it.lastModified() < oldPhotoCutoff }?.forEach { it.delete() }
        if (intent.getBooleanExtra(openNotificationsExtra, false)) screen = "notifications"
        if (backend.ready) {
            backend.watchAuth { user ->
                val accountChanged = cloudUser?.uid != user?.uid
                if (accountChanged) {
                    openingSellerChat = false
                    conversationDialog?.dismiss()
                    countryRegistration?.remove()
                    countryRegistration = null
                    dealerRegistration?.remove()
                    dealerRegistration = null
                    dealerApplication = null
                    activeCountry = (prefs.getStringSet(
                        if (user == null) "countries" else "countries:" + user.uid,
                        emptySet()
                    ) ?: emptySet()).toMutableSet()
                }
                cloudUser = user
                if (accountChanged && user != null) {
                    dealerRegistration = backend.watchDealerApplication { application, error ->
                        if (cloudUser?.uid == user.uid && error == null) {
                            dealerApplication = application
                            submitDealerAfterVerification()
                        }
                    }
                }
                syncDeviceNotificationListener()
                searchRegistrations.forEach { it.remove() }
                searchRegistrations.clear()
                cloudSearches = emptyList()
                searchAlerts = emptyList()
                searchAlertsLoaded = false
                searchAlertsLoadFailed = false
                user?.let {
                    countryRegistration = backend.watchCountries(it.uid) { selected, exists, error ->
                        if (cloudUser?.uid != it.uid || error != null) return@watchCountries
                        if (exists) {
                            activeCountry = selected.toMutableSet()
                            prefs.edit().putStringSet("countries:" + it.uid, selected).apply()
                        } else {
                            val legacy = prefs.getStringSet("countries", emptySet()).orEmpty()
                            if (legacy.isNotEmpty() && prefs.getString("legacyCountryOwner", null) == null) {
                                prefs.edit().putString("legacyCountryOwner", it.uid).apply()
                                activeCountry = legacy.toMutableSet()
                                backend.saveCountries(activeCountry) { saveError ->
                                    if (saveError != null) toast(saveError)
                                }
                            }
                        }
                        if (screen == "home" || screen == "settings") render()
                    }
                    backend.watchSavedSearches(it.uid) { searches, _ ->
                        cloudSearches = searches
                        if (screen == "searches") renderSavedSearches()
                    }?.let(searchRegistrations::add)
                    backend.watchSavedSearchAlerts { alerts, error ->
                        searchAlerts = alerts
                        searchAlertsLoaded = error == null
                        searchAlertsLoadFailed = error != null
                        if (screen == "searches") renderSavedSearches()
                    }?.let(searchRegistrations::add)
                }
                backend.watchOwned(user?.uid) { cars ->
                    ownCars.clear();ownCars.addAll(cars);render()
                }
                backend.watchFavorites(user?.uid) { ids ->
                    cloudStars = ids.toMutableSet();render()
                }
                render()
            }
            backend.watchPublic({ cars ->
                listingsLoaded = true
                cloudCars.clear();cloudCars.addAll(cars);render()
            }, { error -> listingsLoaded = true; toast(error); render() })
        }
        render()
        if (!prefs.contains("language")) root.post { chooseFirstLanguage() }
    }

    private fun chooseFirstLanguage() {
        AlertDialog.Builder(this).setTitle(t("chooseLanguage"))
            .setCancelable(false)
            .setItems(codes.map { messages.optJSONObject(it)?.optString("displayName") ?: it }.toTypedArray()) { _,index ->
                locale = codes[index]
                prefs.edit().putString("language", locale).apply()
                render()
            }.show()
    }

    private fun t(k: String): String {
        releaseMessages.optJSONObject(locale)?.optString(k)?.takeIf { it.isNotBlank() }?.let { return it }
        val local = messages.optJSONObject(locale)
        val value = local?.optString(k) ?: ""
        if (value.isNotBlank() && value != k) return value
        val de = releaseMessages.optJSONObject("de")?.optString(k)?.takeIf { it.isNotBlank() }
            ?: messages.optJSONObject("de")?.optString(k).orEmpty()
        return if (de.isNotBlank()) de else k
    }
    private fun px(dp: Int): Int = (dp * resources.displayMetrics.density + .5f).toInt()
    private fun c(color: Int, radius: Int = 14, stroke: Int? = null): GradientDrawable = GradientDrawable().apply {
        setColor(color); cornerRadius = px(radius).toFloat()
        if (stroke != null) setStroke(px(1), stroke)
    }
    private fun gradient(): GradientDrawable = GradientDrawable(
        GradientDrawable.Orientation.BOTTOM_TOP, intArrayOf(0xF0000D17.toInt(), 0x660B2838, 0x140B2838)
    )
    private fun col(bg: Int? = null): LinearLayout = LinearLayout(this).apply {
        orientation = LinearLayout.VERTICAL
        if (bg != null) background = c(bg)
    }
    private fun row(bg: Int? = null): LinearLayout = LinearLayout(this).apply {
        orientation = LinearLayout.HORIZONTAL
        gravity = Gravity.CENTER_VERTICAL
        if (bg != null) background = c(bg)
    }
    private fun text(s: String, size: Float = 14f, color: Int = ink, bold: Boolean = false): TextView = TextView(this).apply {
        text = s; textSize = size; setTextColor(color)
        if (bold) setTypeface(null, Typeface.BOLD)
        includeFontPadding = true
    }
    private fun btn(s: String, filled: Boolean = true, action: () -> Unit): TextView = text(s, 14f, if (filled) paper else navy, true).apply {
        gravity = Gravity.CENTER
        background = c(if (filled) orange else paper, 12, if (filled) null else border)
        setPadding(px(16), px(13), px(16), px(13))
        isClickable = true; isFocusable = true
        minimumHeight = px(46)
        setOnClickListener { action() }
    }
    private val limbaRasterIds: Set<Int> by lazy { setOf(
        R.drawable.limba_home, R.drawable.limba_vehicle_cards, R.drawable.limba_search,
        R.drawable.limba_filter, R.drawable.limba_favorites, R.drawable.limba_add_car,
        R.drawable.limba_messages, R.drawable.limba_notifications, R.drawable.limba_profile,
        R.drawable.limba_car, R.drawable.limba_location, R.drawable.limba_settings,
        R.drawable.limba_info, R.drawable.limba_back, R.drawable.limba_camera,
        R.drawable.limba_security, R.drawable.limba_lock, R.drawable.limba_map,
        R.drawable.limba_logo_symbol, R.drawable.limba_logo_wordmark
    ) }
    private fun drawableIcon(res: Int, color: Int = ink, size: Int = 24): ImageView = ImageView(this).apply {
        setImageResource(res)
        // Tinting a PNG discards the requested blue/black/white 3D appearance.
        imageTintList = if (res in limbaRasterIds) null else ColorStateList.valueOf(color)
        scaleType = ImageView.ScaleType.FIT_CENTER
        layoutParams = lp(size, size)
        importantForAccessibility = View.IMPORTANT_FOR_ACCESSIBILITY_NO
    }
    private fun iconButton(res: Int, description: String, color: Int = ink, backgroundColor: Int = paper,
                           action: () -> Unit): FrameLayout = FrameLayout(this).apply {
        background = c(backgroundColor, 14, if (backgroundColor == paper) border else null)
        minimumWidth = px(48); minimumHeight = px(48)
        isClickable = true; isFocusable = true
        contentDescription = description
        val glyph = drawableIcon(res, color, 23)
        addView(glyph, fp(24, 24, Gravity.CENTER))
        setOnClickListener { action() }
    }
    private fun iconText(res: Int, caption: String, action: () -> Unit, fill: Boolean = false): LinearLayout = row().apply {
        gravity = Gravity.CENTER
        background = c(if (fill) orange else paper, 12, if (fill) null else border)
        isClickable = true; isFocusable = true; minimumHeight = px(48)
        contentDescription = caption
        setPadding(px(12), px(10), px(12), px(10))
        addView(drawableIcon(res, if (fill) paper else navy, 20), lp(20, 20))
        addView(spaceHorizontal(8))
        addView(text(caption, 13f, if (fill) paper else navy, true))
        setOnClickListener { action() }
    }
    private fun label(s: String): TextView = text(s, 12f, muted, true).apply {
        setPadding(0, px(12), 0, px(5))
    }
    private fun lp(w: Int = -1, h: Int = -2) = LinearLayout.LayoutParams(if (w < 0) w else px(w), if (h < 0) h else px(h))
    private fun fp(w: Int = -1, h: Int = -1, g: Int = Gravity.TOP or Gravity.START) = FrameLayout.LayoutParams(if (w < 0) w else px(w), if (h < 0) h else px(h), g)
    private fun space(height: Int) = View(this).apply { layoutParams = lp(-1, height) }
    private fun pad(v: View, x: Int = 18, y: Int = 16) { v.setPadding(px(x), px(y), px(x), px(y)) }
    private fun toast(s: String) = Toast.makeText(this, s, Toast.LENGTH_SHORT).show()
    private fun euro(n: Int): String {
        val rate = exchangeRates[priceCurrency]
        val currency = if (rate != null && rate > 0.0) priceCurrency else "EUR"
        val value = n.toDouble() * (if (currency == "EUR") 1.0 else rate!!)
        val formatted = NumberFormat.getNumberInstance(Locale.GERMANY).apply { maximumFractionDigits = 0 }.format(value)
        return formatted + if (currency == "EUR") " €" else " " + currency + " ≈"
    }
    private fun loadExchangeRates() {
        Thread {
            val values = runCatching {
                val connection = java.net.URL("https://open.er-api.com/v6/latest/EUR").openConnection() as java.net.HttpURLConnection
                connection.connectTimeout = 6000
                connection.readTimeout = 6000
                connection.setRequestProperty("Accept", "application/json")
                try {
                    if (connection.responseCode != 200) throw IllegalStateException("FX network")
                    val payload = JSONObject(connection.inputStream.bufferedReader().use { it.readText() })
                    if (payload.optString("result") != "success") throw IllegalStateException("FX response")
                    val data = payload.getJSONObject("rates")
                    val rates = listOf("MKD", "ALL", "RSD", "CHF").associateWith { data.optDouble(it, 0.0) }
                    if (rates.values.any { !it.isFinite() || it <= 0.0 }) throw IllegalStateException("FX incomplete")
                    rates to payload.optString("time_last_update_utc")
                } finally { connection.disconnect() }
            }
            runOnUiThread {
                values.onSuccess { (rates, date) ->
                    exchangeRates.putAll(rates)
                    fxUpdated = date
                    if (screen in listOf("home","details","favorites","performance","mine","swipe")) render()
                }.onFailure {
                    priceCurrency = "EUR"
                    prefs.edit().putString("displayCurrency", "EUR").apply()
                    toast("Wechselkurs nicht verfügbar – Anzeige in EUR")
                    if (screen == "home") renderHome()
                }
            }
        }.start()
    }
    private fun showCurrencyPicker() {
        val currencies = listOf("EUR", "MKD", "ALL", "RSD", "CHF")
        AlertDialog.Builder(this).setTitle("Währung anzeigen (Basispreis EUR)")
            .setSingleChoiceItems(currencies.toTypedArray(), currencies.indexOf(priceCurrency)) { dialog, index ->
                priceCurrency = currencies[index]
                prefs.edit().putString("displayCurrency", priceCurrency).apply()
                dialog.dismiss()
                if (priceCurrency != "EUR" && exchangeRates[priceCurrency] == null) loadExchangeRates()
                render()
            }
            .setNegativeButton(t("cancel"), null).show()
    }
    private fun number(n: Int) = NumberFormat.getIntegerInstance(Locale.GERMANY).format(n)
    private fun navigate(next: String) {
        if (next != screen) navigationHistory.addLast(screen)
        screen = next
        render()
    }
    private fun goBack() {
        if (navigationHistory.isNotEmpty()) {
            if (screen == "details") activePreviewCar = null
            screen = navigationHistory.removeLast()
            render()
        } else if (screen != "home") {
            screen = "home"
            render()
        } else super.onBackPressed()
    }
    private fun container(): LinearLayout {
        screenRegistration?.remove()
        screenRegistration = null
        root.removeAllViews()
        root.setBackgroundColor(navy)
        val main = col()
        main.setBackgroundColor(mist)
        root.addView(main, fp())
        if (screen !in listOf("details", "messages", "notifications")) {
            val fab = FrameLayout(this).apply {
                background = c(orange, 28)
                elevation = px(11).toFloat()
                minimumWidth = px(52); minimumHeight = px(52)
                isClickable = true; isFocusable = true
                contentDescription = t("addVehicle")
                addView(text("+", 33f, paper, true).apply { gravity = Gravity.CENTER },
                    fp(52, 52, Gravity.CENTER))
                setOnClickListener { showCarForm() }
            }
            val pos = fp(52, 52, Gravity.BOTTOM or Gravity.END)
            pos.setMargins(px(9), px(9), px(16), px(84))
            root.addView(fab, pos)
        }
        return main
    }

    private fun toolbar(main: LinearLayout, section: String, back: (() -> Unit)? = null) {
        val line = row(paper)
        line.setPadding(px(12), px(7), px(12), px(7))
        if (back != null) {
            val backButton = iconButton(R.drawable.limba_back, t("backToMarket")) { goBack() }
            backButton.background = null
            line.addView(backButton, lp(42, 48))
        }
        val headline = col()
        headline.addView(drawableIcon(R.drawable.limba_logo_wordmark, ink, 135), lp(135, 38))
        headline.addView(text(section, 10f, muted, true))
        line.addView(headline, LinearLayout.LayoutParams(0, -2, 1f))
        line.addView(iconButton(R.drawable.limba_profile, t("accountLogin")) { showAccountMenu() }, lp(48,48))
        main.addView(line, lp(-1, 65))
    }

    private fun showAccountMenu() {
        val actions = arrayOf(t("accountLogin"), t("settings"), t("myAds"),
            t("yourSavedSearch"), t("messages"), t("notifications"))
        AlertDialog.Builder(this).setTitle(t("accountLogin"))
            .setItems(actions) { _, choice ->
                when(choice) {
                    0 -> showAccount()
                    1 -> navigate("settings")
                    2 -> navigate("mine")
                    3 -> navigate("searches")
                    4 -> if (requireOnlineAccount() != null) navigate("messages") else Unit
                    5 -> if (requireOnlineAccount() != null) navigate("notifications") else Unit
                }
            }.show()
    }

    private fun navigation(main: LinearLayout) {
        val nav = row(paper).apply { gravity = Gravity.CENTER }
        val routes = listOf(
            Triple("home", R.drawable.limba_search, t("carsNav")),
            Triple("swipe", R.drawable.limba_vehicle_cards, "Swipe"),
            Triple("performance", R.drawable.limba_car, t("performance")),
            Triple("profile", R.drawable.limba_profile, "Profil")
        )
        routes.forEach { (route, icon, name) ->
            val selected = screen == route
            val cell = col().apply {
                gravity = Gravity.CENTER
                setPadding(px(3), px(6), px(3), px(6))
                isClickable = true; isFocusable = true; minimumHeight = px(64)
                contentDescription = name
                if (selected) background = c(mist, 11)
            }
            val glyph = drawableIcon(icon, if (selected) orange else muted, 23)
            val center = FrameLayout(this)
            center.addView(glyph, fp(23, 23, Gravity.CENTER))
            cell.addView(center, lp(-1, 27))
            cell.addView(text(name, 10f, if (selected) ink else muted, selected).apply {
                gravity = Gravity.CENTER; maxLines = 1
            })
            nav.addView(cell, LinearLayout.LayoutParams(0, px(66), 1f))
            cell.setOnClickListener { if (route == "profile") showAccountMenu() else navigate(route) }
        }
        main.addView(nav, lp(-1, 66))
    }
    private fun body(main: LinearLayout, content: LinearLayout) {
        val scroll = ScrollView(this).apply { isFillViewport = true; isVerticalScrollBarEnabled = false }
        scroll.addView(content)
        main.addView(scroll, LinearLayout.LayoutParams(-1, 0, 1f))
    }
    private fun render() {
        when (screen) {
            "swipe" -> renderSwipe()
            "details" -> renderDetails()
            "favorites" -> renderFavorites()
            "performance" -> renderPerformance()
            "settings" -> renderSettings()
            "searches" -> renderSavedSearches()
            "messages" -> renderMessages()
            "notifications" -> renderNotifications()
            "mine" -> renderMine()
            else -> renderHome()
        }
    }

    private fun image(height: Int = 210): FrameLayout {
        val frame = FrameLayout(this)
        frame.background = c(navy, 15)
        if (carPhoto != null) {
            val img = ImageView(this).apply { setImageBitmap(carPhoto); scaleType = ImageView.ScaleType.CENTER_CROP }
            frame.addView(img, fp())
        } else {
            frame.addView(drawableIcon(R.drawable.limba_car, paper, 90), fp(90, 90, Gravity.CENTER))
        }
        frame.layoutParams = lp(-1, height)
        frame.clipToOutline = true
        return frame
    }
    private fun listingAvailable(): Boolean {
        if (!BuildConfig.DEBUG || backend.ready) return false
        if (activeCountry.isNotEmpty() && "HR" !in activeCountry) return false
        if (keyword.isNotBlank() && !"nissan gt-r r35 black edition zagreb".contains(keyword.trim().lowercase())) return false
        if (!matchesMake("Nissan") || !matchesModel("GT-R")) return false
        if (maxPrice.toIntOrNull()?.let { 68900 > it } == true) return false
        if (yearFrom.toIntOrNull()?.let { 2013 < it } == true) return false
        if (yearTo.toIntOrNull()?.let { 2013 > it } == true) return false
        if (minMileage.toIntOrNull()?.let { 49500 < it } == true) return false
        if (minPrice.toIntOrNull()?.let { 68900 < it } == true) return false
        if (minPower.toIntOrNull()?.let { 550 < it } == true) return false
        if (maxPower.toIntOrNull()?.let { 550 > it } == true) return false
        if (engineQuery.isNotBlank() && !"3.8 V6 Bi-Turbo VR38DETT".contains(engineQuery,ignoreCase=true)) return false
        if (minCapacity.toIntOrNull()?.let { 3800 < it } == true) return false
        if (maxCapacity.toIntOrNull()?.let { 3800 > it } == true) return false
        if (sellerFilter.isNotBlank() && sellerFilter != "privateSeller") return false
        if (maxMileage.toIntOrNull()?.let { 49500 > it } == true) return false
        if (fuel.isNotBlank() && fuel != "petrol") return false
        if (transmission.isNotBlank() && transmission != "automatic") return false
        if (body.isNotBlank() && body != "coupe") return false
        return true
    }

    private fun canonicalBrand(input: String): String {
        val key = normalizeCatalogName(input)
        return brandAliases[key] ?: canonicalBrands[key] ?: input.trim()
    }

    private fun normalizeCatalogName(value: String): String = Normalizer.normalize(value.trim(), Normalizer.Form.NFKD)
        .replace(catalogAccents, "").replace(catalogSeparators, " ").lowercase(Locale.ROOT)

    private fun matchesMake(value: String): Boolean = make.isBlank() ||
        normalizeCatalogName(canonicalBrand(value)).contains(normalizeCatalogName(canonicalBrand(make)))

    private fun matchesModel(value: String): Boolean = model.isBlank() ||
        normalizeCatalogName(value).contains(normalizeCatalogName(model))
    private fun vehicleDisplayName(car: JSONObject): String =
        listOf(car.optString("make"),car.optString("model"),car.optString("modelExtension"))
            .filter { it.isNotBlank() }.joinToString(" ")

    private fun autoComplete(value: String, hint: String, suggestions: List<String>, callback: (String) -> Unit): AutoCompleteTextView {
        val field = AutoCompleteTextView(this).apply {
            setSingleLine(true); setTextSize(15f); setTextColor(ink); setHintTextColor(muted)
            setHint(hint); setText(value); threshold = 0
            dropDownHeight=px(310)
            setCompoundDrawablesWithIntrinsicBounds(0,0,android.R.drawable.arrow_down_float,0)
            compoundDrawablePadding=px(5)
            setPadding(px(13), px(11), px(13), px(11))
            background = c(paper, 11, border)
            setAdapter(ArrayAdapter(this@MainActivity, android.R.layout.simple_dropdown_item_1line, suggestions))
            setOnFocusChangeListener { _, hasFocus -> if (hasFocus) post { showDropDown() } else callback(text.toString().trim()) }
            setOnClickListener { showDropDown() }
            setOnTouchListener { _, event ->
                if(event.action==MotionEvent.ACTION_UP && event.x>=width-px(46)) {
                    setText(text,false);showDropDown();true
                } else false
            }
            setOnItemClickListener { _, _, _, _ -> callback(text.toString().trim());dismissDropDown() }
        }
        return field
    }
    private fun input(value: String, hint: String, numeric: Boolean = false): EditText = EditText(this).apply {
        setSingleLine(true); setText(value); setHint(hint); textSize = 15f
        setTextColor(ink); setHintTextColor(muted)
        if (numeric) inputType = android.text.InputType.TYPE_CLASS_NUMBER
        background = c(paper, 11, border)
        setPadding(px(13), px(11), px(13), px(11))
    }
    private fun editField(parent: LinearLayout, caption: String, existing: String, hint: String, numeric: Boolean = false): EditText {
        parent.addView(label(caption))
        val field = input(existing, hint, numeric)
        parent.addView(field, lp(-1, 48))
        return field
    }
    private fun picker(parent: LinearLayout, title: String, values: List<Pair<String, String>>, current: String, onPick: (String) -> Unit) {
        parent.addView(label(title))
        val spinner = Spinner(this).apply { background = c(paper, 12, border) }
        spinner.adapter = ArrayAdapter(this, android.R.layout.simple_spinner_dropdown_item, values.map { it.second })
        spinner.setSelection(values.indexOfFirst { it.first == current }.coerceAtLeast(0))
        spinner.onItemSelectedListener = object : android.widget.AdapterView.OnItemSelectedListener {
            override fun onNothingSelected(parent: android.widget.AdapterView<*>?) {}
            override fun onItemSelected(parent: android.widget.AdapterView<*>?, view: View?, position: Int, id: Long) { onPick(values[position].first) }
        }
        parent.addView(spinner, lp(-1, 52))
    }

    // Two equally sized search controls with aligned labels and 48dp touch targets.
    private fun compactSearchPair(parent: LinearLayout, leftLabel: String, leftField: View,
                                  rightLabel: String, rightField: View) {
        fun cell(caption: String, field: View): LinearLayout = col().apply {
            addView(label(caption).apply {
                minHeight = px(43)
                gravity = Gravity.BOTTOM or Gravity.START
                setPadding(0, px(4), 0, px(6))
            }, lp(-1, -2))
            addView(field, lp(-1, 48))
        }
        val pair = row().apply { gravity = Gravity.BOTTOM }
        pair.addView(cell(leftLabel, leftField), LinearLayout.LayoutParams(0, -2, 1f))
        pair.addView(spaceHorizontal(10))
        pair.addView(cell(rightLabel, rightField), LinearLayout.LayoutParams(0, -2, 1f))
        parent.addView(pair, lp(-1, -2))
        parent.addView(space(4))
    }

    private fun photoKindLabel(kind: String): String = t("photo" + kind.replaceFirstChar { it.uppercase() })

    private fun validHttps(url: String): Boolean {
        val uri = Uri.parse(url)
        return uri.scheme.equals("https", ignoreCase = true) && !uri.host.isNullOrBlank() && uri.userInfo == null
    }

    private fun listingImage(url: String?, description: String, height: Int): FrameLayout = FrameLayout(this).apply {
        background = c(navy, 14)
        clipToOutline = true
        addView(drawableIcon(R.drawable.limba_car, paper, 78), fp(78, 78, Gravity.CENTER))
        if (url.isNullOrBlank() || !validHttps(url)) {
            contentDescription = description
        } else {
            val photo = ImageView(this@MainActivity).apply {
                scaleType = ImageView.ScaleType.CENTER_CROP
                contentDescription = description
            }
            addView(photo, fp())
            com.bumptech.glide.Glide.with(this@MainActivity).load(url).centerCrop().into(photo)
        }
        layoutParams = lp(-1, height)
    }

    private fun listingPhotos(car: JSONObject): List<Pair<Int, String>> {
        val images = car.optJSONArray("images")
        val gallery = (0 until (images?.length() ?: 0)).mapNotNull { index ->
            images?.optString(index)?.takeIf(::validHttps)?.let { index to it }
        }
        return gallery.ifEmpty { listOfNotNull(car.optString("image").takeIf(::validHttps)?.let { 0 to it }) }
    }

    private fun showListingGallery(parent: LinearLayout, car: JSONObject): (Int) -> Unit {
        val gallery = listingPhotos(car)
        val photos = col()
        parent.addView(photos, lp(-1, -2))
        if (gallery.isEmpty()) {
            photos.addView(listingImage(null, vehicleDisplayName(car), 218))
            return {}
        }
        fun display(index: Int) {
            detailPhotoIndex = index.coerceIn(gallery.indices)
            val (slot, url) = gallery[detailPhotoIndex]
            photos.removeAllViews()
            photos.addView(listingImage(url, vehicleDisplayName(car), 250))
            val paging = row().apply { gravity = Gravity.CENTER }
            if (gallery.size > 1) {
                paging.addView(iconButton(R.drawable.ic_arrow_left, t("prevPhoto")) {
                    detailPhotoIndex = (detailPhotoIndex + gallery.size - 1) % gallery.size
                    display(detailPhotoIndex)
                }, lp(48, 48))
            }
            paging.addView(text("${detailPhotoIndex + 1} / ${gallery.size}", 13f, muted, true).apply {
                gravity = Gravity.CENTER
            }, LinearLayout.LayoutParams(0, -2, 1f))
            if (gallery.size > 1) {
                paging.addView(iconButton(R.drawable.ic_arrow_right, t("nextPhoto")) {
                    detailPhotoIndex = (detailPhotoIndex + 1) % gallery.size
                    display(detailPhotoIndex)
                }, lp(48, 48))
            }
            photos.addView(paging)
            car.optJSONObject("photoDetails")?.optJSONObject(slot.toString())?.let { entry ->
                val caption = listOf(photoKindLabel(entry.optString("kind", "other")), entry.optString("note"))
                    .filter { it.isNotBlank() }.joinToString(" · ")
                photos.addView(text(caption, 13f, muted))
                photos.addView(text(t("sellerClaims"), 11f, muted))
            }
        }
        display(detailPhotoIndex)
        return { slot ->
            val selected = gallery.indexOfFirst { it.first == slot }
            if (selected >= 0) {
                display(selected)
                photos.requestRectangleOnScreen(android.graphics.Rect(0, 0, photos.width, px(250)), false)
            }
        }
    }

    private fun showVehiclePassport(parent: LinearLayout, car: JSONObject?, selectPhoto: ((Int) -> Unit)? = null) {
        val panel=col(paper).apply {setPadding(px(16),px(14),px(16),px(14));background=c(paper,15,border)}
        panel.addView(text("✦ "+t("vehiclePass"),20f,ink,true))
        panel.addView(space(5));panel.addView(text(t("sellerClaims"),12f,muted))
        for((key,value) in listOf(
            t("serviceHistory") to car?.optString("serviceHistory").orEmpty(),
            t("tuningDetails") to car?.optString("modificationNotes").orEmpty(),
            t("documentNotes") to car?.optString("documentNotes").orEmpty()
        )){
            panel.addView(space(11));panel.addView(text(key,12f,muted,true))
            panel.addView(text(value.ifBlank {t("noInfo")},14f,ink))
        }
        if (car != null && selectPhoto != null) {
            val details = car.optJSONObject("photoDetails")
            val labelled = listingPhotos(car).mapNotNull { (index, _) ->
                details?.optJSONObject(index.toString())?.let { index to it }
            }
            if (labelled.isNotEmpty()) {
                panel.addView(label(t("photoDetails")))
                for ((index, item) in labelled) {
                    val caption = listOf(photoKindLabel(item.optString("kind", "other")), item.optString("note"))
                        .filter { it.isNotBlank() }.joinToString(" · ")
                    panel.addView(btn(caption, false) { selectPhoto(index) })
                    panel.addView(space(6))
                }
            }
        }
        val battery = car?.optJSONObject("batteryReport")
        if (car?.optString("fuel") == "electric" && battery != null) {
            panel.addView(label(t("batteryReport")))
            val health = NumberFormat.getNumberInstance(Locale.forLanguageTag(locale))
                .format(battery.optDouble("health"))
            panel.addView(text("${t("batteryHealth")} · $health %", 15f, ink, true))
            panel.addView(text("${t("batteryMeasuredAt")} · ${battery.optString("measuredAt")}", 13f, muted))
            panel.addView(text("${t("batteryIssuer")} · ${battery.optString("issuer")}", 13f, muted))
            val url = battery.optString("url")
            if (validHttps(url)) {
                panel.addView(space(6))
                panel.addView(btn(t("batteryOpen"), false) {
                    runCatching { startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url))) }
                        .onFailure { toast(t("featureUnavailable")) }
                })
            }
        }
        parent.addView(panel,lp(-1,-2))
    }
    private fun renderPerformance() {
        val main=container();toolbar(main,t("performance"),{navigate("home")})
        val content=col(navy).apply{setPadding(px(17),px(22),px(17),px(22))}
        content.addView(text("LIMBA PERFORMANCE",22f,0xffffbe63.toInt(),true))
        content.addView(space(6));content.addView(text(t("performanceDesc"),13f,0xffc2d7e2.toInt()));content.addView(space(16))
        if (!listingsLoaded) { loadingCards(content); body(main, content); navigation(main); return }
        var found=false
        for(car in cloudCars.filter{matchesCar(it)}+previewCars.filter{matchesPreview(it)}){
            if(car.optString("modelExtension").isBlank()&&car.optString("modificationNotes").isBlank())continue
            content.addView(previewCard(car));content.addView(space(12));found=true
        }
        if(!found)emptyState(content,t("noPerformance"))
        body(main,content);navigation(main)
    }

    private fun renderHome() {
        val main = container()
        toolbar(main, t("carsNav"))
        val content = col()
        val hero = col(navy).apply { setPadding(px(19), px(17), px(19), px(17)) }
        hero.addView(text("LIMBA SHOWROOM", 12f, 0xff88c7f6.toInt(), true))
        hero.addView(space(6))
        hero.addView(text("Dein nächstes Auto beginnt hier.", 23f, paper, true))
        hero.addView(space(4))
        hero.addView(text("Marke, Modell, Preis und Suchland direkt wählen.", 12f, 0xffd8e9f5.toInt()))
        content.addView(hero)
        val form = col(paper).apply { setPadding(px(16), px(15), px(16), px(16)) }
        form.addView(text(t("carsNav"), 18f, ink, true))
        form.addView(space(7))
        val makes = brands.optJSONArray("makes")
        val makeItems = mutableListOf<String>()
        if (makes != null) for (i in 0 until makes.length()) makeItems.add(makes.optString(i))
        val makeField = autoComplete(make, t("allMakes"), makeItems) { make = it }
        val modelArr = brands.optJSONObject("models")?.optJSONArray(canonicalBrand(make))
        val models = mutableListOf<String>()
        if (modelArr != null) for (i in 0 until modelArr.length()) models.add(modelArr.optString(i))
        val modelField = autoComplete(model, t("allModels"), models) { model = it }
        compactSearchPair(form, t("make"), makeField, t("model"), modelField)
        makeField.addTextChangedListener(object : android.text.TextWatcher {
            override fun beforeTextChanged(s: CharSequence?, start: Int, count: Int, after: Int) {}
            override fun onTextChanged(s: CharSequence?, start: Int, before: Int, count: Int) {
                val arr = brands.optJSONObject("models")?.optJSONArray(canonicalBrand(s.toString()))
                val choices = mutableListOf<String>()
                if (arr != null) for (i in 0 until arr.length()) choices.add(arr.optString(i))
                // Only reset the selected model after an actual make change.
                if (s.toString().trim() != make && modelField.text.isNotBlank()) modelField.setText("")
                modelField.setAdapter(ArrayAdapter(this@MainActivity, android.R.layout.simple_dropdown_item_1line, choices))
            }
            override fun afterTextChanged(s: android.text.Editable?) {}
        })
        val priceField = input(maxPrice, "€", true)
        lateinit var captureFields: () -> Unit
        val selectedCountries = countries.filter { it.first in activeCountry }.joinToString(" · ") { it.second }
        val countryField = btn(selectedCountries.ifBlank { t("allCountries") }, false) {
            captureFields(); showSearchCountries()
        }.apply { setSingleLine(true); ellipsize = android.text.TextUtils.TruncateAt.END }
        compactSearchPair(form, t("priceTo"), priceField, t("filterCountry"), countryField)
        val keywordField = editField(form, t("searchTerms"), keyword, t("keywordExample"))
        captureFields = {
            keyword = keywordField.text.toString().trim(); make = makeField.text.toString().trim()
            model = modelField.text.toString().trim(); maxPrice = priceField.text.toString().trim()
        }
        form.addView(space(9))
        form.addView(btn(t("showResults"), true) { captureFields(); renderHome() })
        form.addView(space(8))
        form.addView(iconText(R.drawable.limba_filter, t("moreFilters"), {
            captureFields(); showAdvanced()
        }))
        val actions = row()
        actions.addView(btn(t("resetFilters"), false) { clearFilters(); renderHome() }, LinearLayout.LayoutParams(0, px(46), 1f))
        actions.addView(spaceHorizontal(8))
        actions.addView(btn(t("saveSearch"), false) { captureFields(); saveSearch() }, LinearLayout.LayoutParams(0, px(46), 1f))
        form.addView(space(8));form.addView(actions)
        content.addView(form)
        val spotlight=col(navy).apply{setPadding(px(18),px(17),px(18),px(17))}
        val featured=cloudCars.firstOrNull{matchesCar(it)} ?: previewCars.firstOrNull{matchesPreview(it)}
        if (featured != null || listingAvailable()) {
            spotlight.addView(text(t("showroom"),13f,0xff8dccff.toInt(),true))
            spotlight.addView(space(9))
            val featureImage=ImageView(this).apply{
                scaleType=ImageView.ScaleType.CENTER_CROP
                background=c(0xff173f53.toInt(),12)
                clipToOutline=true
            }
            if(featured!=null && featured.optString("image").startsWith("https://"))
                com.bumptech.glide.Glide.with(this).load(featured.optString("image")).centerCrop().into(featureImage)
            else if(carPhoto!=null)featureImage.setImageBitmap(carPhoto)
            spotlight.addView(featureImage,lp(-1,220));spotlight.addView(space(12))
            if(featured!=null){
                spotlight.addView(text(vehicleDisplayName(featured),21f,paper,true))
                spotlight.addView(space(5));spotlight.addView(text(euro(featured.optInt("price")),22f,0xff8dccff.toInt(),true))
                spotlight.addView(space(10))
                spotlight.addView(btn(t("openShowroom"),false){activePreviewCar=featured;openDetails("home")})
            }else{
                spotlight.addView(text("Nissan GT-R R35 Black Edition",21f,paper,true))
                spotlight.addView(space(5));spotlight.addView(text(euro(68900),22f,0xff8dccff.toInt(),true))
                spotlight.addView(text(t("demoOnly"),11f,paper))
                spotlight.addView(space(10))
                spotlight.addView(btn(t("openShowroom"),false){activePreviewCar=null;openDetails("home")})
            }
            content.addView(space(10));content.addView(spotlight)
        }
        content.addView(iconText(R.drawable.limba_car,t("performance"),{navigate("performance")}))
        val results=col().apply{setPadding(px(17),px(22),px(17),px(20))}
        fun refreshResults(){
            results.removeAllViews()
            val available=cloudCars.filter{matchesCar(it)}
            val preview=previewCars.filter{matchesPreview(it)}
            val demo=listingAvailable()
            val total=available.size+preview.size+(if(demo)1 else 0)
            results.addView(text(t("latestCars"),21f,ink,true))
            results.addView(space(5))
            results.addView(text(if (listingsLoaded) total.toString()+" "+t("searchResultCount") else t("loading"),12f,orange,true))
            val sellerSegments = row()
            for ((value, label) in listOf("" to "allSeller", "privateSeller" to "privateSeller", "dealer" to "dealer")) {
                if (sellerSegments.childCount > 0) sellerSegments.addView(spaceHorizontal(5))
                sellerSegments.addView(btn(t(label), sellerFilter == value) {
                    sellerFilter = value
                    refreshResults()
                }, LinearLayout.LayoutParams(0, px(44), 1f))
            }
            results.addView(sellerSegments)
            results.addView(space(9))
            showQuickCountryChips(results)
            results.addView(space(8))
            results.addView(btn("Währung: " + priceCurrency + if (fxUpdated.isNotBlank() && priceCurrency != "EUR") " · Referenzkurs" else "", false) { showCurrencyPicker() })
            if (priceCurrency != "EUR") results.addView(text("Unverbindliche Umrechnung, Inseratspreise in EUR.", 11f, muted))
            showFilterChips(results)
            results.addView(space(13))
            if (!listingsLoaded) { loadingCards(results); return }
            available.forEach{results.addView(previewCard(it));results.addView(space(12))}
            preview.forEach{results.addView(previewCard(it));results.addView(space(12))}
            if(demo){results.addView(carCard());results.addView(space(12))}
            if(total==0) {
                emptyState(results,t("emptyCars"))
                results.addView(space(8))
                results.addView(btn(t("resetFilters"), false) { clearFilters(); renderHome() })
                results.addView(space(8))
                results.addView(btn("🇲🇰 Alle Fahrzeuge in Nordmazedonien", false) {
                    clearFilters(); activeCountry = mutableSetOf("MK"); persistSearchCountries(); renderHome()
                })
                results.addView(space(8))
                results.addView(btn("🇽🇰 Fahrzeuge im Kosovo", false) {
                    clearFilters(); activeCountry = mutableSetOf("XK"); persistSearchCountries(); renderHome()
                })
                results.addView(space(8))
                results.addView(btn("✦ Performance entdecken", false) {
                    clearFilters(); activeCountry.clear(); persistSearchCountries(); navigate("performance")
                })
            }
            results.addView(space(16))
            results.addView(btn(t("yourSavedSearch"),false){navigate("searches")})
            results.addView(space(9))
        }
        refreshResults()
        content.addView(results)
        body(main,content)
        navigation(main)
        // Live search updates only result cards. Keep the input/keyboard and chosen dropdown open.
        val uiHandler=android.os.Handler(android.os.Looper.getMainLooper())
        var scheduled:Runnable?=null
        val scheduleSearch={
            scheduled?.let{uiHandler.removeCallbacks(it)}
            scheduled=Runnable {
                if(screen=="home" && results.isAttachedToWindow){
                    captureFields()
                    refreshResults()
                }
            }
            uiHandler.postDelayed(scheduled!!,130)
        }
        for(field in listOf(keywordField,makeField,modelField,priceField)){
            field.addTextChangedListener(object:android.text.TextWatcher{
                override fun beforeTextChanged(s:CharSequence?,start:Int,count:Int,after:Int){}
                override fun onTextChanged(s:CharSequence?,start:Int,before:Int,count:Int){scheduleSearch()}
                override fun afterTextChanged(s:android.text.Editable?){}
            })
        }
    }

    private fun showQuickCountryChips(parent: LinearLayout) {
        val labelRow = row()
        labelRow.addView(text(t("filterCountry"), 14f, ink, true), LinearLayout.LayoutParams(0, -2, 1f))
        labelRow.addView(btn(t("allCountries"), false) { activeCountry.clear(); persistSearchCountries(); renderHome() })
        parent.addView(labelRow)
        val chipRow = row()
        countries.forEach { (code, flag, name) ->
            val selected = code in activeCountry
            val chip = btn("$flag $name", selected) {
                if (code in activeCountry) activeCountry.remove(code) else activeCountry.add(code)
                persistSearchCountries(); renderHome()
            }.apply {
                minHeight = px(44)
                setSingleLine(true)
            }
            chipRow.addView(chip, lp(-2, 46))
            chipRow.addView(spaceHorizontal(6))
        }
        parent.addView(HorizontalScrollView(this).apply {
            isHorizontalScrollBarEnabled = false
            addView(chipRow)
        }, lp(-1, -2))
    }
    private fun loadingCards(parent: LinearLayout) {
        for (item in 0 until 3) {
            val card = col(paper).apply { background = c(paper, 15, border); setPadding(px(10), px(10), px(10), px(15)) }
            fun shimmer(width: Int, height: Int): View {
                val line = View(this).apply { background = c(0xffe2e9ef.toInt(), 9) }
                val anim = android.animation.ObjectAnimator.ofFloat(line, "alpha", .55f, 1f)
                anim.duration = 1100L
                anim.repeatCount = android.animation.ValueAnimator.INFINITE
                anim.repeatMode = android.animation.ValueAnimator.REVERSE
                anim.start()
                line.layoutParams = lp(width, height)
                return line
            }
            card.addView(shimmer(-1, 154))
            card.addView(space(12)); card.addView(shimmer(150, 20))
            card.addView(space(8)); card.addView(shimmer(225, 13))
            card.addView(space(8)); card.addView(shimmer(120, 13))
            parent.addView(card); parent.addView(space(11))
        }
    }
    private fun showSearchCountries() {
        val selected = countries.map { it.first in activeCountry }.toBooleanArray()
        AlertDialog.Builder(this).setTitle(t("filterCountry"))
            .setMultiChoiceItems(countries.map { "${it.second} ${it.third}" }.toTypedArray(), selected) { _, index, checked ->
                selected[index] = checked
            }
            .setPositiveButton(t("showResults")) { _, _ ->
                activeCountry = countries.mapIndexedNotNull { index, item ->
                    item.first.takeIf { selected[index] }
                }.toMutableSet()
                persistSearchCountries()
                renderHome()
            }
            .setNeutralButton(t("allCountries")) { _, _ ->
                activeCountry.clear()
                persistSearchCountries()
                renderHome()
            }
            .setNegativeButton(t("cancel"), null).show()
    }

    private fun showFilterChips(parent: LinearLayout) {
        val chips = row().apply { setPadding(0, px(8), 0, px(4)) }
        fun chip(caption: String, value: String, clear: () -> Unit) {
            if (value.isBlank()) return
            val title = "$caption · $value"
            chips.addView(btn("$title ×", false) { clear(); renderHome() }.apply {
                contentDescription = "${t("removeFilter")} · $title"
            }, lp(-2, 46))
            chips.addView(spaceHorizontal(6))
        }
        chip(t("make"), make) { make = ""; model = "" }
        chip(t("model"), model) { model = "" }
        chip(t("searchTerms"), keyword) { keyword = "" }
        chip(t("priceFrom"), minPrice) { minPrice = "" }
        chip(t("priceTo"), maxPrice) { maxPrice = "" }
        chip(t("yearFrom"), yearFrom) { yearFrom = "" }
        chip(t("yearTo"), yearTo) { yearTo = "" }
        chip(t("mileageFrom"), minMileage) { minMileage = "" }
        chip(t("mileageTo"), maxMileage) { maxMileage = "" }
        chip(t("powerFrom"), minPower) { minPower = "" }
        chip(t("powerTo"), maxPower) { maxPower = "" }
        chip(t("engineTerm"), engineQuery) { engineQuery = "" }
        chip(t("capacityFrom"), minCapacity) { minCapacity = "" }
        chip(t("capacityTo"), maxCapacity) { maxCapacity = "" }
        chip(t("fuel"), t(fuel)) { fuel = "" }
        chip(t("transmission"), t(transmission)) { transmission = "" }
        chip(t("body"), t(body)) { body = "" }
        chip(t("sellerType"), t(sellerFilter)) { sellerFilter = "" }
        if (chips.childCount == 0) return
        parent.addView(HorizontalScrollView(this).apply {
            contentDescription = t("activeFilters")
            addView(chips)
        }, lp(-1, -2))
    }
    private fun spaceHorizontal(width: Int) = View(this).apply { layoutParams = lp(width, 1) }
    private fun carCard(): LinearLayout {
        val card = col(paper)
        card.background = c(paper, 18, border)
        card.clipToOutline = true
        val picture = image(228)
        card.addView(picture, lp(-1, 228))
        val block = col().apply { setPadding(px(17), px(15), px(17), px(18)) }
        block.addView(text("Nissan GT-R R35 Black Edition", 19f, ink, true))
        block.addView(space(5))
        block.addView(text("2013   ·   49.500 km   ·   550 PS", 13f, muted))
        block.addView(space(7))
        block.addView(text("🇭🇷 Zagreb   ·   " + t("conditionUsed") + "   ·   " + t("privateSeller"), 12f, muted))
        block.addView(space(11))
        val priced = row()
        priced.addView(text(euro(68900), 23f, ink, true), LinearLayout.LayoutParams(0, -2, 1f))
        priced.addView(iconButton(R.drawable.limba_favorites, t("saveFavourites"), if (starred) orange else ink) {
            setFavorite(!starred); renderHome()
        }, lp(56, 48))
        block.addView(priced)
        block.addView(space(9))
        block.addView(iconText(R.drawable.limba_info,t("vehicleDetails"),{
            activePreviewCar=null;openDetails(if(screen == "favorites") "favorites" else "home")
        }, true))
        block.addView(space(6))
        block.addView(text(t("demoOnly"), 11f, muted))
        card.addView(block)
        return card
    }
    private fun savePreviewCars() {
        val arr = JSONArray()
        previewCars.forEach { arr.put(it) }
        prefs.edit().putString("previewCars",arr.toString()).apply()
    }
    private fun matchesPreview(x: JSONObject): Boolean =
        previewUser.isNotBlank() && x.optString("uid") == previewUser && matchesCar(x)

    private fun matchesCar(x: JSONObject): Boolean {
        if (x.optString("status","active") != "active") return false
        val country = x.optString("country")
        if (activeCountry.isNotEmpty() && country !in activeCountry) return false
        if (keyword.isNotBlank()) {
            val searchableText = listOf("title", "make", "model", "modelExtension", "city", "description",
                "serviceHistory", "modificationNotes").joinToString(" ") { x.optString(it) }.lowercase(Locale.ROOT)
            if (!searchableText.contains(keyword.trim().lowercase(Locale.ROOT))) return false
        }
        if (!matchesMake(x.optString("make")) || !matchesModel(x.optString("model"))) return false
        if (maxPrice.toIntOrNull()?.let { x.optInt("price") > it } == true) return false
        if (yearFrom.toIntOrNull()?.let { x.optInt("year") < it } == true) return false
        if (maxMileage.toIntOrNull()?.let { x.optInt("mileage") > it } == true) return false
        if (minMileage.toIntOrNull()?.let { x.optInt("mileage") < it } == true) return false
        if (yearTo.toIntOrNull()?.let { x.optInt("year") > it } == true) return false
        if (minPrice.toIntOrNull()?.let { x.optInt("price") < it } == true) return false
        if (minPower.toIntOrNull()?.let { x.optInt("power") < it } == true) return false
        if (maxPower.toIntOrNull()?.let { x.optInt("power") > it } == true) return false
        if (engineQuery.isNotBlank() && !x.optString("engineName").lowercase(Locale.ROOT)
                .contains(engineQuery.trim().lowercase(Locale.ROOT))) return false
        if ((minCapacity.isNotBlank() || maxCapacity.isNotBlank()) && x.optInt("engineCapacity") == 0) return false
        if (minCapacity.toIntOrNull()?.let { x.optInt("engineCapacity") < it } == true) return false
        if (maxCapacity.toIntOrNull()?.let { x.optInt("engineCapacity") > it } == true) return false
        if (sellerFilter.isNotBlank() && sellerFilter!=x.optString("sellerType")) return false
        if (fuel.isNotBlank() && fuel != x.optString("fuel")) return false
        if (transmission.isNotBlank() && transmission != x.optString("transmission")) return false
        if (body.isNotBlank() && body != x.optString("body")) return false
        return true
    }
    private fun previewCard(car: JSONObject): LinearLayout {
        val id = car.optString("id")
        val live = previewCars.none { it.optString("id") == id }
        val liked = if (live) id in cloudStars else id in previewStars
        val open = { activePreviewCar = car; openDetails(screen) }
        val isPerformance = screen == "performance"
        val cardBackground = if (isPerformance) 0xff1b2935.toInt() else paper
        val foreground = if (isPerformance) paper else ink
        val subdued = if (isPerformance) 0xffc6d4dd.toInt() else muted
        val view = col(cardBackground).apply { background = c(cardBackground, 16, if (isPerformance) 0xff456276.toInt() else border); clipToOutline = true }
        view.addView(listingImage(car.optString("image").takeIf { live }, vehicleDisplayName(car), 188).apply {
            isFocusable = true
            setOnClickListener { open() }
        }, lp(-1, 188))
        val content = col().apply { pad(this, 15, 12) }
        val priceRow = row()
        priceRow.addView(text(euro(car.optInt("price")), 24f, foreground, true), LinearLayout.LayoutParams(0, -2, 1f))
        priceRow.addView(iconButton(R.drawable.limba_favorites, t("saveFavourites"), if (liked) orange else ink) {
            if (live && cloudUser == null) {
                showAccount()
            } else if (live) {
                backend.toggleFavorite(id, !liked) { error -> if (error != null) toast(error) }
            } else {
                if (liked) previewStars.remove(id) else previewStars.add(id)
                prefs.edit().putStringSet("previewStars", previewStars.toSet()).apply()
                render()
            }
        }, lp(48, 48))
        content.addView(priceRow)
        content.addView(text(vehicleDisplayName(car), 19f, foreground, true))
        content.addView(space(5))
        content.addView(text("${car.optInt("year")} · ${number(car.optInt("mileage"))} km · ${car.optInt("power")} PS", 13f, subdued))
        val countryFlag = countries.firstOrNull { it.first == car.optString("country") }?.second ?: "🌐"
        val location = "$countryFlag " + car.optString("city") + " · " + car.optString("country")
        val seller = if (live) t(car.optString("sellerType", "privateSeller")) else t("previewOnly")
        content.addView(text("$location · $seller", 13f, subdued))
        val customs = when (car.optString("customsStatus")) {
            "cleared" -> "✓ Verzollt"
            "pending" -> "⚠ Import offen"
            else -> "Zollstatus nicht angegeben"
        }
        content.addView(text(customs, 11f, subdued))
        if (isPerformance) {
            val notes = (car.optString("modificationNotes") + " " + car.optString("modelExtension")).lowercase(Locale.ROOT)
            val tags = mutableListOf<String>()
            if (notes.contains("stage 1")) tags.add("Stage 1")
            if (notes.contains("stage 2")) tags.add("Stage 2")
            if (notes.contains("gewindefahrwerk") || notes.contains("coilover")) tags.add("Gewindefahrwerk")
            if (notes.contains("abgasanlage") || notes.contains("exhaust")) tags.add("Abgasanlage")
            if (tags.isNotEmpty()) {
                val tuning = row()
                tags.take(3).forEach { tag ->
                    tuning.addView(text(tag, 10f, 0xffffcc75.toInt(), true).apply {
                        background = c(0xff473522.toInt(), 10)
                        setPadding(px(7), px(6), px(7), px(6))
                    })
                    tuning.addView(spaceHorizontal(6))
                }
                content.addView(space(7)); content.addView(tuning)
            }
        }
        content.addView(space(9))
        content.addView(iconText(R.drawable.limba_info, t("vehicleProfile"), open))
        view.addView(content)
        return view
    }
    private fun emptyState(parent: LinearLayout, msg: String) {
        val box = col(paper).apply { gravity = Gravity.CENTER; setPadding(px(18), px(38), px(18), px(38)); background = c(paper, 15, border) }
        box.addView(drawableIcon(R.drawable.limba_search, orange, 36), lp(36, 36))
        box.addView(text(msg, 14f, muted).apply { gravity = Gravity.CENTER })
        parent.addView(box)
    }

    private fun showAdvanced() {
        val panel=col().apply{setPadding(px(15),px(5),px(15),px(15))}
        var fuelDraft=fuel;var transDraft=transmission;var bodyDraft=body;var sellerDraft=sellerFilter
        picker(panel,t("fuel"),listOf("" to t("allFuel"),"petrol" to t("petrol"),"diesel" to t("diesel"),"hybrid" to t("hybrid"),"electric" to t("electric")),fuelDraft){fuelDraft=it}
        picker(panel,t("transmission"),listOf("" to t("allTransmission"),"automatic" to t("automatic"),"manual" to t("manual")),transDraft){transDraft=it}
        picker(panel,t("body"),listOf("" to t("allBody"),"suv" to t("suv"),"sedan" to t("sedan"),"wagon" to t("wagon"),"hatchback" to t("hatchback"),"coupe" to t("coupe")),bodyDraft){bodyDraft=it}
        picker(panel,t("sellerType"),listOf("" to t("allSeller"),"privateSeller" to t("privateSeller"),"dealer" to t("dealer")),sellerDraft){sellerDraft=it}
        val mileageStart=editField(panel,t("mileageFrom"),minMileage,t("minKm"),true)
        val mileageEnd=editField(panel,t("mileageTo"),maxMileage,"km",true)
        val yearStart=editField(panel,t("yearFrom"),yearFrom,"2013",true)
        val yearEnd=editField(panel,t("yearTo"),yearTo,"2020",true)
        val priceStart=editField(panel,t("priceFrom"),minPrice,"€",true)
        val hpStart=editField(panel,t("powerFrom"),minPower,t("minHp"),true)
        val hpEnd=editField(panel,t("powerTo"),maxPower,t("maxHp"),true)
        val motor=editField(panel,t("engineTerm"),engineQuery,t("engineInfo"))
        val capacityStart=editField(panel,t("capacityFrom"),minCapacity,"cm³",true)
        val capacityEnd=editField(panel,t("capacityTo"),maxCapacity,"cm³",true)
        panel.addView(space(9))
        val scroll=ScrollView(this).apply{addView(panel)}
        AlertDialog.Builder(this).setTitle(t("moreFilters")).setView(scroll)
            .setPositiveButton(t("showResults")) { _, _ ->
                fuel=fuelDraft;transmission=transDraft;body=bodyDraft;sellerFilter=sellerDraft
                minMileage=mileageStart.text.toString().trim()
                maxMileage=mileageEnd.text.toString().trim()
                yearFrom=yearStart.text.toString().trim()
                yearTo=yearEnd.text.toString().trim()
                minPrice=priceStart.text.toString().trim()
                minPower=hpStart.text.toString().trim()
                maxPower=hpEnd.text.toString().trim()
                engineQuery=motor.text.toString().trim()
                minCapacity=capacityStart.text.toString().trim()
                maxCapacity=capacityEnd.text.toString().trim()
                renderHome()
            }
            .setNegativeButton(t("cancel"),null).show()
    }
    private fun clearFilters() { keyword="";make="";model="";maxPrice="";yearFrom="";maxMileage="";fuel="";transmission="";body="";minMileage="";yearTo="";minPrice="";minPower="";maxPower="";engineQuery="";minCapacity="";maxCapacity="";sellerFilter="" }
    private val searchFilterLengths = mapOf(
        "keyword" to 120, "make" to 35, "model" to 65, "priceTo" to 12, "yearFrom" to 4,
        "mileageTo" to 12, "fuel" to 16, "transmission" to 16, "body" to 16, "sellerType" to 20,
        "priceFrom" to 12, "yearTo" to 4, "mileageFrom" to 12, "powerFrom" to 10, "powerTo" to 10,
        "engineTerm" to 80, "capacityFrom" to 10, "capacityTo" to 10
    )
    private val legacySearchFields = mapOf(
        "priceTo" to "maxPrice", "priceFrom" to "minPrice", "mileageFrom" to "minMileage",
        "mileageTo" to "maxMileage", "powerFrom" to "minPower", "powerTo" to "maxPower",
        "capacityFrom" to "minCapacity", "capacityTo" to "maxCapacity", "engineTerm" to "engineQuery",
        "sellerType" to "sellerFilter"
    )

    private fun searchName(filters: JSONObject): String = listOf("make", "model", "keyword")
        .map { filters.optString(it).trim() }.filter { it.isNotBlank() }.joinToString(" ").take(120)
        .ifBlank { t("yourSavedSearch") }

    private fun jsonStrings(array: JSONArray?): List<String> = (0 until (array?.length() ?: 0)).mapNotNull { i ->
        array?.optString(i)?.takeIf { it.isNotBlank() }
    }

    private fun canonicalSearch(item: JSONObject): JSONObject {
        val current = item.optJSONObject("filters")
        val filters = JSONObject()
        for ((key, limit) in searchFilterLengths) {
            val raw = current?.optString(key) ?: item.optString(legacySearchFields[key] ?: key)
            filters.put(key, raw.trim().take(limit))
        }
        val selected = jsonStrings(item.optJSONArray("countries")).toSet().sorted()
        return JSONObject().put("name", item.optString("name").trim().take(120).ifBlank { searchName(filters) })
            .put("filters", filters).put("countries", JSONArray(selected))
    }

    private fun savedSearchesOnDevice(): JSONArray = runCatching { JSONArray(prefs.getString("searches", "[]")) }
        .getOrElse { JSONArray() }

    private fun saveSearch() {
        val filters = JSONObject(mapOf(
            "keyword" to keyword, "make" to make, "model" to model, "priceTo" to maxPrice, "yearFrom" to yearFrom,
            "mileageTo" to maxMileage, "fuel" to fuel, "transmission" to transmission, "body" to body,
            "sellerType" to sellerFilter, "priceFrom" to minPrice, "yearTo" to yearTo, "mileageFrom" to minMileage,
            "powerFrom" to minPower, "powerTo" to maxPower, "engineTerm" to engineQuery,
            "capacityFrom" to minCapacity, "capacityTo" to maxCapacity
        ))
        val search = canonicalSearch(JSONObject().put("filters", filters).put("countries", JSONArray(activeCountry.toList())))
        fun keepLocally() {
            val saved = savedSearchesOnDevice()
            val alreadySaved = (0 until saved.length()).mapNotNull(saved::optJSONObject)
                .any { backend.sameSavedSearch(canonicalSearch(it), search) }
            if (!alreadySaved) prefs.edit().putString("searches", saved.put(search).toString()).apply()
        }
        if (cloudUser != null && previewUser.isBlank()) {
            backend.saveSearch(search) { error ->
                if (error == null) toast(t("searchTitleSaved"))
                else {
                    keepLocally()
                    toast("${t("searchTitleSaved")} · ${t("previewNotSynced")}")
                }
            }
        } else {
            keepLocally()
            toast(t("searchTitleSaved"))
        }
    }

    private fun applySavedSearch(item: JSONObject) {
        val filters = item.getJSONObject("filters")
        keyword = filters.optString("keyword"); make = filters.optString("make"); model = filters.optString("model")
        maxPrice = filters.optString("priceTo"); yearFrom = filters.optString("yearFrom"); maxMileage = filters.optString("mileageTo")
        fuel = filters.optString("fuel"); transmission = filters.optString("transmission"); body = filters.optString("body")
        minMileage = filters.optString("mileageFrom"); yearTo = filters.optString("yearTo"); minPrice = filters.optString("priceFrom")
        minPower = filters.optString("powerFrom"); maxPower = filters.optString("powerTo"); engineQuery = filters.optString("engineTerm")
        minCapacity = filters.optString("capacityFrom"); maxCapacity = filters.optString("capacityTo"); sellerFilter = filters.optString("sellerType")
        activeCountry = jsonStrings(item.optJSONArray("countries")).toMutableSet()
        persistSearchCountries()
        navigate("home")
    }
    private fun setFavorite(value: Boolean) { starred = value; prefs.edit().putBoolean("favorite", value).apply() }
    private fun openDetails(from: String) { backFromDetail = from; detailPhotoIndex = 0; navigate("details") }

    private fun showGarageComparison(cars: List<JSONObject>) {
        val pair=compareVehicleIds.mapNotNull {id->cars.firstOrNull{it.optString("id")==id}}
        if(pair.size!=2){toast(t("selectTwo"));return}
        val col=col().apply{setPadding(px(12),px(8),px(12),px(8))}
        val head=row(navy).apply{setPadding(px(8),px(12),px(8),px(12))}
        head.addView(text("",11f,paper),LinearLayout.LayoutParams(0,-2,.75f))
        pair.forEach{head.addView(text(vehicleDisplayName(it),12f,paper,true),LinearLayout.LayoutParams(0,-2,1f))}
        col.addView(head)
        val fields=listOf(
            t("price") to "price",t("firstReg") to "year",t("mileage") to "mileage",
            t("power") to "power",t("fuel") to "fuel",t("transmission") to "transmission",
            t("serviceHistory") to "serviceHistory",t("tuningDetails") to "modificationNotes"
        )
        fields.forEachIndexed{idx,(title,key)->
            val row=row(if(idx%2==0)paper else mist).apply{setPadding(px(7),px(11),px(7),px(11))}
            row.addView(text(title,11f,muted,true),LinearLayout.LayoutParams(0,-2,.75f))
            pair.forEach{car->
                val value=when(key){
                    "price"->euro(car.optInt(key))
                    "mileage"->number(car.optInt(key))+" km"
                    "fuel","transmission"->t(car.optString(key))
                    else->car.optString(key).ifBlank{t("noInfo")}
                }
                row.addView(text(value,12f,ink,true),LinearLayout.LayoutParams(0,-2,1f))
            }
            col.addView(row)
        }
        col.addView(space(9));col.addView(text(t("sellerClaims"),12f,muted))
        val scroll=ScrollView(this).apply{addView(col)}
        AlertDialog.Builder(this).setTitle(t("compare")).setView(scroll)
            .setPositiveButton(t("cancel"), null).show()
    }
    private fun renderFavorites() {
        val main=container();toolbar(main,t("garage"))
        val content=col().apply{setPadding(px(17),px(20),px(17),px(20))}
        content.addView(text(t("garage"),23f,ink,true))
        content.addView(space(7));content.addView(text(t("garageDesc"),13f,muted));content.addView(space(16))
        val cars=mutableListOf<JSONObject>()
        cars.addAll(cloudCars.filter{it.optString("id") in cloudStars})
        cars.addAll(previewCars.filter{it.optString("id") in previewStars && matchesPreview(it)})
        if(starred && BuildConfig.DEBUG && !backend.ready)cars.add(JSONObject().put("id","demo-nissan-gtr")
            .put("title","Nissan GT-R R35 Black Edition").put("make","Nissan").put("model","GT-R")
            .put("price",68900).put("year",2013).put("mileage",49500).put("power",550)
            .put("fuel","petrol").put("transmission","automatic"))
        compareVehicleIds.retainAll(cars.map{it.optString("id")}.toSet())
        if(cars.isEmpty())emptyState(content,t("noGarage"))
        for(car in cars){
            if(car.optString("id")=="demo-nissan-gtr")content.addView(carCard())
            else content.addView(previewCard(car))
            val id=car.optString("id")
            val check=CheckBox(this).apply{
                text=t("compare");textSize=13f;setTextColor(ink)
                isChecked=id in compareVehicleIds
                minHeight=px(45)
                setOnCheckedChangeListener {button,checked->
                    if(checked){
                        if(compareVehicleIds.size>=2){button.isChecked=false;toast(t("compareTooMany"))}
                        else compareVehicleIds.add(id)
                    } else compareVehicleIds.remove(id)
                }
            }
            content.addView(check);content.addView(space(12))
        }
        if(cars.isNotEmpty()){
            content.addView(btn(t("compare"),true){showGarageComparison(cars)})
            content.addView(space(7))
            content.addView(btn(t("clearCompare"),false){compareVehicleIds.clear();renderFavorites()})
        }
        body(main,content);navigation(main)
    }
    private fun renderSavedSearches() {
        val main = container()
        toolbar(main, t("yourSavedSearch"), { navigate("home") })
        val content = col().apply { pad(this, 17, 20) }
        content.addView(text(t("yourSavedSearch"), 22f, ink, true))
        content.addView(space(12))
        val production = cloudUser != null && previewUser.isBlank()
        if (production) {
            content.addView(iconText(R.drawable.limba_notifications, t("notifications"), { navigate("notifications") }))
            content.addView(space(14))
        }
        val local = savedSearchesOnDevice()
        val rows = ((if (production) cloudSearches else emptyList()) +
            (0 until local.length()).mapNotNull(local::optJSONObject)).map(::canonicalSearch).toMutableList()
        for (alert in searchAlerts.filter { production }) {
            if (rows.none { backend.sameSavedSearch(it, alert) }) rows.add(canonicalSearch(alert))
        }
        val displayed = mutableListOf<JSONObject>()
        for (item in rows) {
            if (displayed.any { backend.sameSavedSearch(it, item) }) continue
            displayed.add(item)
            val cell = col(paper).apply { pad(this, 14, 12); background = c(paper, 14, border) }
            cell.addView(text(item.optString("name"), 16f, ink, true))
            cell.addView(space(6))
            cell.addView(btn(t("showResults"), false) { applySavedSearch(item) })
            if (production) {
                val enabled = searchAlerts.any { backend.sameSavedSearch(item, it) }
                val status = when {
                    searchAlertsLoadFailed -> "featureUnavailable"
                    !searchAlertsLoaded -> "loading"
                    enabled -> "searchAlertOn"
                    else -> "searchAlertOff"
                }
                cell.addView(label(t(status)))
                lateinit var toggle: TextView
                toggle = btn(t(if (enabled) "searchAlertDisable" else "searchAlertEnable"), false) {
                    if (requireOnlineAccount(verified = true) != null) {
                        toggle.isEnabled = false
                        backend.setSavedSearchAlert(item.optString("name"), item.getJSONObject("filters"),
                            jsonStrings(item.optJSONArray("countries")), !enabled) { error ->
                            toggle.isEnabled = true
                            if (error != null) toast(t("featureUnavailable"))
                            else if (!enabled && !prefs.getBoolean("limbaNotificationOptIn", false)) requestDeviceNotifications()
                        }
                    }
                }
                toggle.isEnabled = searchAlertsLoaded
                toggle.alpha = if (searchAlertsLoaded) 1f else .55f
                cell.addView(toggle)
            }
            content.addView(cell)
            content.addView(space(9))
        }
        if (displayed.isEmpty()) emptyState(content, t("noSearches"))
        body(main, content)
        navigation(main)
    }

    private fun requireOnlineAccount(verified: Boolean = false): com.google.firebase.auth.FirebaseUser? {
        if (!backend.ready || previewUser.isNotBlank()) {
            toast(t("featureUnavailable"))
            return null
        }
        val user = cloudUser
        if (user == null || (verified && !user.isEmailVerified)) {
            if (user != null) toast(t("verifiedRequired"))
            showAccount()
            return null
        }
        return user
    }

    private fun shortDate(timestamp: Long): String = if (timestamp > 0L)
        java.text.DateFormat.getDateInstance(java.text.DateFormat.MEDIUM, Locale.forLanguageTag(locale))
            .format(java.util.Date(timestamp)) else ""

    private fun showPriceHistory(car: JSONObject) {
        val content = col().apply { pad(this, 18, 12) }
        content.addView(text(t("loading"), 14f, muted))
        val dialog = AlertDialog.Builder(this).setTitle(t("priceHistory"))
            .setView(ScrollView(this).apply { addView(content) }).setPositiveButton(t("cancel"), null).show()
        backend.listPriceHistory(car.optString("id")) { events, error ->
            if (!dialog.isShowing) return@listPriceHistory
            content.removeAllViews()
            if (error != null || events.isEmpty()) {
                content.addView(text(t(if (error != null) "featureUnavailable" else "priceHistoryEmpty"), 14f, muted))
            }
            for (event in events) {
                content.addView(text(shortDate(event.optLong("changedAt")), 12f, muted))
                content.addView(text(euro(event.optInt("price")), 18f, ink, true))
                if (!event.isNull("previousPrice")) {
                    content.addView(text("${t("pricePrevious")} · ${euro(event.optInt("previousPrice"))}", 13f, muted))
                }
                content.addView(space(12))
            }
        }
    }

    private fun renderNotifications() {
        val main = container()
        toolbar(main, t("notifications"), { navigate("home") })
        val content = col().apply { pad(this, 17, 20) }
        content.addView(text(t("notifications"), 23f, ink, true))
        if (cloudUser != null && !deviceNotificationsAllowed()) {
            content.addView(btn(permissionText("Gerätebenachrichtigungen aktivieren", "Enable device notifications"), false) {
                requestDeviceNotifications()
            })
        }
        content.addView(space(14))
        val list = col()
        content.addView(list)
        body(main, content)
        navigation(main)
        if (cloudUser == null || previewUser.isNotBlank()) {
            list.addView(btn(t("accountLogin")) { showAccount() })
            return
        }
        list.addView(text(t("loading"), 14f, muted))
        screenRegistration = backend.watchNotifications { notifications, error ->
            if (screen != "notifications" || !list.isAttachedToWindow) return@watchNotifications
            list.removeAllViews()
            if (error != null || notifications.isEmpty()) {
                emptyState(list, t(if (error != null) "featureUnavailable" else "notificationsEmpty"))
            }
            for (item in notifications) {
                val read = item.optBoolean("read")
                val listing = item.optString("listingId")
                val title = item.optString("listingTitle").ifBlank { t("vehicleProfile") }
                val panel = col(paper).apply {
                    background = c(paper, 14, if (read) border else orange)
                    pad(this, 14, 12)
                }
                panel.addView(text(title, 17f, ink, true))
                panel.addView(text(listOf(item.optString("searchName"), shortDate(item.optLong("createdAt")))
                    .filter { it.isNotBlank() }.joinToString(" · "), 13f, muted))
                panel.addView(space(8))
                panel.addView(btn(t("vehicleDetails"), false) {
                    if (!read) backend.markNotificationRead(item.optString("id")) { error ->
                        if (error != null) toast(t("featureUnavailable"))
                    }
                    backend.fetchListing(listing) { car, _ ->
                        if (screen == "notifications") {
                            if (car == null) toast(t("listingUnavailable"))
                            else { activePreviewCar = car; openDetails("notifications") }
                        }
                    }
                })
                if (!read) {
                    panel.addView(space(6))
                    panel.addView(btn(t("notificationRead"), false) {
                        backend.markNotificationRead(item.optString("id")) { error ->
                            if (error != null) toast(t("featureUnavailable"))
                        }
                    })
                }
                list.addView(panel)
                list.addView(space(8))
            }
        }
    }

    private fun renderMessages() {
        val main = container()
        toolbar(main, t("messages"), { navigate("home") })
        val content = col().apply { pad(this, 17, 20) }
        content.addView(text(t("messages"), 23f, ink, true))
        content.addView(space(14))
        val list = col()
        content.addView(list)
        body(main, content)
        navigation(main)
        if (cloudUser == null || previewUser.isNotBlank()) {
            list.addView(btn(t("accountLogin")) { showAccount() })
            return
        }
        list.addView(text(t("loading"), 14f, muted))
        screenRegistration = backend.watchThreads { threads, error ->
            if (screen != "messages" || !list.isAttachedToWindow) return@watchThreads
            list.removeAllViews()
            if (error != null || threads.isEmpty()) {
                emptyState(list, t(if (error != null) "featureUnavailable" else "chatEmpty"))
            }
            for (thread in threads) {
                val title = thread.optString("listingTitle").ifBlank { t("messages") }
                val panel = col(paper).apply { pad(this, 14, 12); background = c(paper, 14, border) }
                panel.addView(text(title, 16f, ink, true))
                val last = thread.optString("lastMessage")
                if (last.isNotBlank()) panel.addView(text(last, 13f, muted).apply { maxLines = 2 })
                panel.addView(text(shortDate(thread.optLong("updatedAt")), 12f, muted))
                panel.addView(space(8))
                panel.addView(btn(t("messages"), false) { showConversation(thread.optString("id"), title) })
                list.addView(panel)
                list.addView(space(8))
            }
        }
    }

    private fun startSellerChat(car: JSONObject) {
        val user = requireOnlineAccount(verified = true) ?: return
        if (openingSellerChat) return
        val id = car.optString("id")
        openingSellerChat = true
        backend.startListingChat(id) { threadId, error ->
            openingSellerChat = false
            if (!isFinishing && screen == "details" && activePreviewCar?.optString("id") == id && cloudUser?.uid == user.uid) {
                if (threadId == null || error != null) toast(t("featureUnavailable"))
                else showConversation(threadId, vehicleDisplayName(car))
            }
        }
    }

    private fun showConversation(threadId: String, title: String) {
        val user = requireOnlineAccount() ?: return
        conversationDialog?.dismiss()
        val content = col().apply { pad(this, 16, 8) }
        val feed = col()
        val viewport = ScrollView(this).apply {
            isFillViewport = true
            addView(feed)
        }
        content.addView(viewport, lp(-1, 188))
        feed.addView(text(t("loading"), 14f, muted))
        val status = text("", 13f, muted).apply { visibility = View.GONE }
        content.addView(status)
        val composer = editField(content, t("chatMessage"), "", t("chatMessage")).apply {
            filters = arrayOf(android.text.InputFilter.LengthFilter(2000))
        }
        val shortcuts = row()
        val quick = listOf("chatAvailableQuestion", "chatTestDriveQuestion").map { key ->
            val value = t(key)
            btn(value, false) { composer.setText(value); composer.setSelection(value.length) }.also {
                shortcuts.addView(it, LinearLayout.LayoutParams(0, -2, 1f))
            }
        }
        content.addView(space(6))
        content.addView(shortcuts)
        val controls = row()
        content.addView(space(6))
        content.addView(controls)
        val dialog = AlertDialog.Builder(this).setTitle(title)
            .setView(ScrollView(this).apply { addView(content) }).setPositiveButton(t("chatSend"), null)
            .setNegativeButton(t("chatBack"), null).create()
        var thread: JSONObject? = null
        var pendingMessage: Pair<String, String>? = null
        var sending = false
        var changingBlock = false
        var listenerFailed = false
        val block = btn(t("chatBlock"), false) {}
        val report = btn(t("chatReport"), false) { showChatReport(threadId) }
        controls.addView(block, LinearLayout.LayoutParams(0, -2, 1f))
        controls.addView(spaceHorizontal(8))
        controls.addView(report, LinearLayout.LayoutParams(0, -2, 1f))
        fun syncControls() {
            val blockedBy = jsonStrings(thread?.optJSONArray("blockedBy"))
            val blocked = blockedBy.isNotEmpty()
            val writable = thread != null && user.isEmailVerified && !listenerFailed
            val enabled = writable && !blocked && !sending
            val statusText = when {
                listenerFailed -> t("featureUnavailable")
                !user.isEmailVerified -> t("verifiedRequired")
                blocked -> t("chatBlocked")
                else -> ""
            }
            status.text = statusText
            status.visibility = if (statusText.isBlank()) View.GONE else View.VISIBLE
            composer.isEnabled = enabled
            quick.forEach { it.isEnabled = enabled }
            dialog.getButton(AlertDialog.BUTTON_POSITIVE)?.isEnabled = enabled
            block.text = t(if (user.uid in blockedBy) "chatUnblock" else "chatBlock")
            block.isEnabled = writable && !changingBlock
            report.isEnabled = writable
        }
        val registrations = mutableListOf<ListenerRegistration>()
        dialog.setOnDismissListener {
            registrations.forEach { it.remove() }
            if (conversationDialog === dialog) conversationDialog = null
        }
        dialog.setOnShowListener {
            dialog.window?.setSoftInputMode(WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE)
            val send = dialog.getButton(AlertDialog.BUTTON_POSITIVE)
            send.setOnClickListener {
                val message = composer.text.toString().trim()
                if (message.isBlank() || sending) return@setOnClickListener
                val id = pendingMessage?.takeIf { it.first == message }?.second ?: UUID.randomUUID().toString()
                pendingMessage = message to id
                sending = true
                syncControls()
                backend.sendListingMessage(threadId, message, id) { error ->
                    if (dialog.isShowing) {
                        sending = false
                        if (error == null) { pendingMessage = null; composer.text.clear() }
                        else toast(t("featureUnavailable"))
                        syncControls()
                    }
                }
            }
            block.setOnClickListener {
                val blocked = user.uid in jsonStrings(thread?.optJSONArray("blockedBy"))
                changingBlock = true
                syncControls()
                backend.setListingChatBlocked(threadId, !blocked) { error ->
                    if (dialog.isShowing) {
                        changingBlock = false
                        if (error != null) toast(t("featureUnavailable"))
                        syncControls()
                    }
                }
            }
            syncControls()
            backend.watchThread(threadId) { value, error ->
                if (dialog.isShowing) {
                    thread = value
                    listenerFailed = error != null || value == null
                    syncControls()
                }
            }?.let(registrations::add)
            backend.watchMessages(threadId) { messages, error ->
                if (!dialog.isShowing) return@watchMessages
                feed.removeAllViews()
                if (error != null || messages.isEmpty()) {
                    feed.addView(text(t(if (error != null) "featureUnavailable" else "chatEmpty"), 14f, muted))
                }
                for (message in messages) {
                    val own = user.uid == message.optString("senderUid")
                    val align = row().apply { gravity = if (own) Gravity.END else Gravity.START }
                    val bubble = col(if (own) Color.rgb(226, 241, 255) else mist).apply { pad(this, 12, 8) }
                    bubble.addView(text(message.optString("text"), 14f, ink))
                    val date = shortDate(message.optLong("createdAt"))
                    if (date.isNotBlank()) bubble.addView(text(date, 11f, muted))
                    align.addView(bubble, lp(-2, -2))
                    feed.addView(align)
                    feed.addView(space(7))
                }
                viewport.post { viewport.fullScroll(View.FOCUS_DOWN) }
            }?.let(registrations::add)
        }
        conversationDialog = dialog
        dialog.show()
    }

    private fun showChatReport(threadId: String) {
        val container = col().apply { pad(this, 16, 8) }
        val reason = editField(container, t("chatReportReason"), "", t("chatReportReason")).apply {
            filters = arrayOf(android.text.InputFilter.LengthFilter(500))
        }
        val dialog = AlertDialog.Builder(this).setTitle(t("chatReport")).setView(container)
            .setPositiveButton(t("chatReport"), null).setNegativeButton(t("cancel"), null).create()
        dialog.setOnShowListener {
            val submit = dialog.getButton(AlertDialog.BUTTON_POSITIVE)
            submit.setOnClickListener {
                val details = reason.text.toString().trim()
                if (details.isBlank()) { reason.error = t("requiredFields"); return@setOnClickListener }
                submit.isEnabled = false
                backend.reportListingChat(threadId, details) { error ->
                    if (dialog.isShowing) {
                        if (error == null) { dialog.dismiss(); toast(t("chatReported")) }
                        else { submit.isEnabled = true; toast(t("featureUnavailable")) }
                    }
                }
            }
        }
        dialog.show()
    }

    private fun persistSearchCountries() {
        val valid = countries.map { it.first }.toSet()
        val selected = activeCountry.filter { it in valid }.toSet()
        val user = cloudUser?.takeIf { previewUser.isBlank() }
        val storageKey = if (user == null) "countries" else "countries:" + user.uid
        prefs.edit().putStringSet(storageKey, selected).apply()
        if (user != null) backend.saveCountries(selected) { error ->
            if (error != null) toast(error)
        }
    }

    private fun renderSettings() {
        val main=container();toolbar(main,t("settings"),{navigate("home")})
        val content=col().apply { setPadding(px(18),px(19),px(18),px(30)) }
        content.addView(text(t("settings"),25f,ink,true));content.addView(space(20))
        content.addView(text(t("language"),16f,ink,true));content.addView(space(6))
        val spinner=Spinner(this).apply {background=c(paper,12,border)}
        spinner.adapter=ArrayAdapter(this, android.R.layout.simple_spinner_dropdown_item, codes.map { messages.optJSONObject(it)?.optString("displayName") ?: it })
        spinner.setSelection(codes.indexOf(locale).coerceAtLeast(0))
        spinner.onItemSelectedListener=object:android.widget.AdapterView.OnItemSelectedListener {
            override fun onNothingSelected(parent:android.widget.AdapterView<*>?){}
            override fun onItemSelected(parent:android.widget.AdapterView<*>?,view:View?,position:Int,id:Long) {
                val selected=codes[position]
                if(selected!=locale){locale=selected;prefs.edit().putString("language",selected).apply();renderSettings()}
            }
        }
        content.addView(spinner,lp(-1,52));content.addView(space(25))
        content.addView(iconText(R.drawable.limba_notifications, t("yourSavedSearch"), {navigate("searches")}))
        content.addView(space(12))
        content.addView(iconText(R.drawable.limba_messages, t("messages"), {
            if (requireOnlineAccount() != null) navigate("messages")
        }))
        content.addView(space(12))
        content.addView(iconText(R.drawable.limba_notifications, t("notifications"), {
            if (requireOnlineAccount() != null) navigate("notifications")
        }))
        content.addView(space(12))
        content.addView(iconText(R.drawable.limba_vehicle_cards,t("myAds"),{navigate("mine")}))
        content.addView(space(18))
        content.addView(text("Vehicle data by VehiclesDB (vehiclesdb.com) · CC BY 4.0",12f,muted))
        content.addView(btn("Sources & licenses",false) {
            startActivity(Intent(Intent.ACTION_VIEW,Uri.parse("https://github.com/raiirajet/Luma/blob/main/docs/VEHICLESDB_ATTRIBUTION.md")))
        })
        body(main,content);navigation(main)
    }

    private fun swipeCandidates(): List<JSONObject?> {
        val cars=(cloudCars.filter { matchesCar(it) } + previewCars.filter { matchesPreview(it) })
            .map { it as JSONObject? }.toMutableList()
        if (listingAvailable()) cars.add(null) // null identifies the built-in Nissan GT-R sample
        return cars
    }
    private fun renderSwipe() {
        screenRegistration?.remove()
        screenRegistration = null
        root.removeAllViews();root.setBackgroundColor(navy)
        val all=swipeCandidates()
        if (all.isEmpty()) {
            val empty=col().apply {gravity=Gravity.CENTER;setPadding(px(20),px(20),px(20),px(20))}
            empty.addView(text(if (listingsLoaded) t("emptyCars") else t("loading"),20f,paper,true))
            empty.addView(space(20));empty.addView(btn(t("backToMarket"),true){navigate("home")})
            root.addView(empty,fp())
            return
        }
        swipeIndex=swipeIndex.coerceIn(0,all.size-1)
        val current=all[swipeIndex]
        val full=FrameLayout(this)
        root.addView(full,fp())
        val placeholder=if(current==null) image() else FrameLayout(this).apply {
            setBackgroundColor(navy)
            if(current.optString("image").startsWith("https://")) {
                val photo=ImageView(this@MainActivity).apply { scaleType=ImageView.ScaleType.CENTER_CROP }
                addView(photo,fp())
                com.bumptech.glide.Glide.with(this@MainActivity).load(current.optString("image")).centerCrop().into(photo)
            } else addView(drawableIcon(R.drawable.limba_car,paper,170),fp(170,170,Gravity.CENTER))
        }
        full.addView(placeholder,fp())
        fun details(){activePreviewCar=current;openDetails("swipe")}
        placeholder.setOnTouchListener(object:View.OnTouchListener {
            var x=0f;var y=0f
            override fun onTouch(v:View,event:MotionEvent):Boolean {
                when(event.actionMasked){
                    MotionEvent.ACTION_DOWN->{x=event.x;y=event.y;return true}
                    MotionEvent.ACTION_UP->{
                        val dx=event.x-x;val dy=event.y-y
                        if(kotlin.math.max(kotlin.math.abs(dx),kotlin.math.abs(dy))<px(52)){details();return true}
                        if(kotlin.math.abs(dx)>kotlin.math.abs(dy)) {
                            if(dx<0){if(swipeIndex+1<all.size){swipeIndex++;renderSwipe()}else toast(t("onlyCar"))}else details()
                        }else{
                            if(dy<0)details() else {
                                val target=all.indices.firstOrNull { it!=swipeIndex && all[it]?.optString("make")==(current?.optString("make")?:"Nissan") }
                                if(target!=null){swipeIndex=target;renderSwipe()}else toast(t("noSimilar"))
                            }
                        }
                        return true
                    }
                    MotionEvent.ACTION_CANCEL->return true
                }
                return true
            }
        })
        full.addView(View(this).apply {background=gradient();isClickable=false},fp())
        val top=row().apply {setPadding(px(16),px(12),px(16),0)}
        top.addView(iconButton(R.drawable.limba_info,t("learnSwipeAgain"),paper,0x99213449.toInt()) {
            showSwipeTutorial()
        },lp(48,48))
        top.addView(View(this),LinearLayout.LayoutParams(0,1,1f))
        top.addView(iconButton(R.drawable.limba_home,t("backToMarket"),paper,0x99213449.toInt()) {
            navigate("home")
        },lp(48,48))
        full.addView(top,fp(-1,-2,Gravity.TOP))
        val overlay=col().apply {setPadding(px(19),0,px(19),px(24))}
        val live=current!=null && current.optString("id") !in previewCars.map{it.optString("id")}
        overlay.addView(text((if(live)t("carsNav")else t("previewOnly")).uppercase()+"  ·  "+(swipeIndex+1)+"/"+all.size,11f,orange,true))
        overlay.addView(space(7))
        val title=if(current==null)"Nissan GT-R R35 Black Edition"else vehicleDisplayName(current)
        overlay.addView(text(title,27f,paper,true));overlay.addView(space(5))
        overlay.addView(text(euro(current?.optInt("price")?:68900),26f,paper,true));overlay.addView(space(5))
        val info=if(current==null)"2013 · 49.500 km · 550 PS · 🇭🇷 Zagreb"
           else current.optString("year")+" · "+number(current.optInt("mileage"))+" km · "+current.optString("power")+" PS · "+current.optString("city")
        overlay.addView(text(info,13f,paper));overlay.addView(space(16))

        val liked=if(current==null)starred else if(live)current.optString("id") in cloudStars else current.optString("id") in previewStars
        val buttons=row().apply { gravity=Gravity.CENTER }
        val next=btn("✕",false) {
            if(swipeIndex+1<all.size){swipeIndex++;renderSwipe()} else toast(t("onlyCar"))
        }.apply { background=c(0xff833a49.toInt(),29);setTextColor(paper);textSize=23f;contentDescription=t("swipeNext") }
        buttons.addView(next,lp(52,52));buttons.addView(spaceHorizontal(9))
        val favorite=iconButton(R.drawable.limba_favorites,t("saveFavourites"),paper,0xffa54d77.toInt()){
            if(current==null)setFavorite(!starred)else {
                val id=current.optString("id")
                if(live){
                    if(cloudUser==null)showAccount()
                    else backend.toggleFavorite(id,id !in cloudStars){err->if(err!=null)toast(err)}
                }else{
                    if(id in previewStars)previewStars.remove(id)else previewStars.add(id)
                    prefs.edit().putStringSet("previewStars",previewStars.toSet()).apply()
                }
            }
            renderSwipe()
        }.apply { background=c(if(liked)0xffba5a81.toInt() else 0xffa54d77.toInt(),29) }
        buttons.addView(favorite,lp(52,52));buttons.addView(spaceHorizontal(9))
        buttons.addView(iconButton(R.drawable.limba_info,t("swipeDetails"),paper,0xff255977.toInt()){
            details()
        }.apply {background=c(0xff255977.toInt(),29)},lp(52,52));buttons.addView(spaceHorizontal(9))
        buttons.addView(btn("⚡",false) {
            val target=all.indices.firstOrNull { it!=swipeIndex && all[it]?.optString("make")==(current?.optString("make")?:"Nissan") }
            if(target!=null){swipeIndex=target;renderSwipe()}else toast(t("noSimilar"))
        }.apply {background=c(0xffa16d21.toInt(),29);setTextColor(paper);textSize=22f;contentDescription=t("swipeSimilar")},lp(52,52))
        overlay.addView(buttons)
        full.addView(overlay,fp(-1,-2,Gravity.BOTTOM))
        if(!swipeSeen)root.post {if(screen=="swipe"&&!swipeSeen)showSwipeTutorial()}
    }

    private fun showSwipeTutorial() {
        if (screen != "swipe" || swipeGuideView?.parent != null) return
        val mask = FrameLayout(this).apply {
            setBackgroundColor(0x99051c2c.toInt())
            isClickable = true
        }
        swipeGuideView = mask
        val tutorial = col(0xffeff8fe.toInt()).apply {
            setPadding(px(17),px(18),px(17),px(16))
            background=c(0xffeff8fe.toInt(),20)
            elevation=px(14).toFloat()
        }
        tutorial.addView(text("LIMBA DRIVE",12f,orange,true))
        tutorial.addView(space(5))
        tutorial.addView(text(t("swipeTeach"),19f,ink,true))
        tutorial.addView(space(9))
        val hints=listOf(
            Triple(R.drawable.ic_arrow_left,"swipeNext","swipeNextSub"),
            Triple(R.drawable.ic_arrow_right,"swipeOpen","swipeOpenSub"),
            Triple(R.drawable.ic_arrow_up,"swipeDetails","swipeDetailsSub"),
            Triple(R.drawable.ic_arrow_down,"swipeSimilar","swipeSimilarSub")
        )
        hints.forEachIndexed { index,(drawable,title,subtitle) ->
            val line=row().apply {setPadding(px(8),px(5),px(8),px(5));background=c(paper,10)}
            line.addView(drawableIcon(drawable,orange,28),lp(28,28))
            line.addView(spaceHorizontal(12))
            line.addView(text(t(title)+" · "+t(subtitle),12f,ink,true))
            tutorial.addView(line,lp(-1,50));tutorial.addView(space(5))
            android.animation.ObjectAnimator.ofFloat(line,"translationY",0f,-px(7).toFloat(),0f).apply {
                duration=900;startDelay=index*140L;start()
            }
        }
        fun closeGuide() {
            swipeSeen=true
            prefs.edit().putBoolean("swipeSeen",true).apply()
            root.removeView(mask)
            swipeGuideView=null
        }
        tutorial.addView(space(4))
        tutorial.addView(btn(t("swipeStart"),true){closeGuide()})
        tutorial.addView(space(6))
        tutorial.addView(btn(t("backToCar"),false){closeGuide()})
        val pos=fp(-1,-2,Gravity.CENTER).apply {setMargins(px(14),px(8),px(14),px(8))}
        mask.addView(tutorial,pos)
        mask.setOnClickListener { closeGuide() }
        root.addView(mask,fp())
    }

    private fun renderPreviewDetails() {
        val car=activePreviewCar ?: return
        val main=container();toolbar(main,t("vehicleProfile"),{activePreviewCar=null;navigate(backFromDetail)})
        val content=col().apply {setPadding(px(18),px(18),px(18),px(22))}
        val live = previewCars.none { it.optString("id") == car.optString("id") }
        val selectPhoto = showListingGallery(content, car)
        content.addView(space(12))
        content.addView(text(vehicleDisplayName(car),25f,ink,true))
        content.addView(space(7));content.addView(text(euro(car.optInt("price")),25f,orange,true));content.addView(space(16))
        val details=listOf(
            t("make") to car.optString("make"),t("model") to car.optString("model"),
             t("modelExtension") to car.optString("modelExtension").ifBlank { "—" },
            t("firstReg") to car.optString("year"),t("mileage") to (number(car.optInt("mileage"))+" km"),
            t("power") to (car.optString("power")+" PS"),t("engineName") to car.optString("engineName").ifBlank{t("noInfo")},
            t("engineCapacity") to (if(car.has("engineCapacity")&&!car.isNull("engineCapacity"))car.optString("engineCapacity")+" cm³" else t("noInfo")),
            t("fuel") to t(car.optString("fuel")),
            t("transmission") to t(car.optString("transmission")),t("body") to t(car.optString("body")),
            t("location") to (car.optString("city")+" · "+car.optString("country")),
            t("carCondition") to t(if(car.optString("condition")=="new")"conditionNew"else "conditionUsed"),
            t("accidentCar") to t(when(car.optString("accidentStatus")){"yes"->"accidentYes";"no"->"accidentNo";else->"accidentUnknown"}),
            t("conditionShort") to (car.optString("conditionNote").ifBlank { t("accidentUnknown") })
        )
        details.forEachIndexed{idx,(label,value)->
            val line=row(if(idx%2==0)paper else mist);line.setPadding(px(12),px(11),px(12),px(11))
            line.addView(text(label,12f,muted),LinearLayout.LayoutParams(0,-2,1f))
            line.addView(text(value,13f,ink,true),LinearLayout.LayoutParams(0,-2,1.25f));content.addView(line)
        }
        content.addView(space(15));content.addView(text(t("vehicleDescription"),20f,ink,true));content.addView(space(8))
        content.addView(text(car.optString("description"),14f,ink));content.addView(space(18))
        showVehiclePassport(content,car,selectPhoto)
        content.addView(space(13))
        if(!live)content.addView(text(t("previewNotSynced"),12f,muted))
        if(live){
            content.addView(btn(t("priceHistory"), false) { showPriceHistory(car) })
            content.addView(space(9))
            val email=car.optString("contactEmail")
            if(email.isNotBlank())content.addView(btn(t("askSeller"),false){
                startActivity(Intent(Intent.ACTION_SENDTO,Uri.parse("mailto:"+Uri.encode(email))))
            })
            content.addView(space(9))
            content.addView(btn(t("reportCar"),false) {
                if(cloudUser==null){showAccount()} else AlertDialog.Builder(this)
                    .setTitle(t("reportCar"))
                    .setItems(arrayOf(t("reportFraud"),t("reportDuplicate"),t("reportInappropriate"),t("reportOther"))) { _,choice ->
                        backend.report(car.optString("id"),listOf("fraud","duplicate","inappropriate","other")[choice]) { error ->
                            toast(error ?: t("reportSent"))
                        }
                    }.show()
            })
        }
        content.addView(space(15))
        content.addView(btn(t("backToListing"),true){activePreviewCar=null;goBack()})
        body(main,content)
        if (live && car.optString("status", "active") == "active" && cloudUser?.uid != car.optString("uid")) {
            val actions = col(paper).apply { pad(this, 16, 8) }
            actions.addView(iconText(R.drawable.limba_messages, t("sellerMessage"), { startSellerChat(car) }, true))
            main.addView(actions, lp(-1, -2))
        }
    }
    private fun renderDetails() {
        if(activePreviewCar!=null){renderPreviewDetails();return}
        val main=container();toolbar(main,"NISSAN GT-R",{navigate(backFromDetail)})
        val content=col()
        content.addView(image(280),lp(-1,280))
        val info=col().apply {setPadding(px(19),px(22),px(19),px(25))}
        info.addView(text(t("demoOnly"),11f,orange,true))
        info.addView(space(8))
        info.addView(text("Nissan GT-R R35 Black Edition",26f,ink,true))
        info.addView(space(9));info.addView(text(euro(68900),28f,orange,true))
        info.addView(space(7));val locationRow = row()
        locationRow.addView(drawableIcon(R.drawable.limba_location, orange, 20), lp(20, 20))
        locationRow.addView(spaceHorizontal(5))
        locationRow.addView(text("🇭🇷 Zagreb · "+t("conditionUsed"),13f,muted))
        info.addView(locationRow)
        info.addView(space(17))
        val actions=row()
        actions.addView(iconText(R.drawable.limba_favorites,t("saved"),{setFavorite(!starred);renderDetails()}),LinearLayout.LayoutParams(0,px(49),1f))
        actions.addView(spaceHorizontal(9))
        actions.addView(iconText(R.drawable.ic_share,t("shareCar"),{shareWebsite()}),LinearLayout.LayoutParams(0,px(49),1f))
        info.addView(actions);info.addView(space(24))
        info.addView(text(t("technicalData"),22f,ink,true));info.addView(space(13))
        val specs=listOf(
            t("make") to "Nissan", t("model") to "GT-R R35",
            t("firstReg") to "2013", t("mileage") to "49.500 km",
            t("power") to "550 PS",t("fuel") to t("petrol"),
            t("transmission") to t("automatic"),t("body") to t("coupe"),
            t("engine") to "3.8 l V6 Biturbo VR38DETT",t("drive") to t("awd"),
            t("color") to t("black"),t("accidentCar") to t("accidentUnknown"),t("seats") to t("fourSeats")
        )
        specs.forEachIndexed { ix,(k,v)->
            val ln=row(if(ix%2==0)paper else mist)
            ln.setPadding(px(12),px(10),px(12),px(10))
            ln.addView(text(k,13f,muted),LinearLayout.LayoutParams(0,-2,1f))
            ln.addView(text(v,13f,ink,true),LinearLayout.LayoutParams(0,-2,1.25f))
            info.addView(ln)
        }
        info.addView(space(22));val descriptionRow = row()
        descriptionRow.addView(drawableIcon(R.drawable.limba_info, orange, 24), lp(24,24))
        descriptionRow.addView(spaceHorizontal(8))
        descriptionRow.addView(text(t("vehicleDescription"),22f,ink,true))
        info.addView(descriptionRow);info.addView(space(10))
        info.addView(text(t("description"),14f,ink).apply {setLineSpacing(px(5).toFloat(),1f)})
        info.addView(space(20))
        showVehiclePassport(info,null)
        info.addView(space(15))
        info.addView(btn(t("photoCredit")+" Joshua Spence · CC BY-SA 4.0",false) {
            startActivity(Intent(Intent.ACTION_VIEW,Uri.parse("https://commons.wikimedia.org/wiki/File:Nissan_GT-R_R35_Black_Edition.JPG")))
        })
        info.addView(space(10))
        info.addView(btn(if(backFromDetail=="swipe")t("backToSwipe")else t("backToListing"),true){goBack()})
        content.addView(info);body(main,content)
    }
    private fun shareWebsite() {
        val i=Intent(Intent.ACTION_SEND).apply {type="text/plain";putExtra(Intent.EXTRA_TEXT,"Limba Auto · https://limba-auto.web.app/")}
        startActivity(Intent.createChooser(i,t("shareCar")))
    }
    private fun hashPassword(password: String, salt: String): String {
        val key=PBEKeySpec(password.toCharArray(),salt.toByteArray(Charsets.UTF_8),120000,256)
        val raw=SecretKeyFactory.getInstance("PBKDF2WithHmacSHA256").generateSecret(key).encoded
        return raw.joinToString("") { "%02x".format(it.toInt() and 255) }
    }
    private fun showAccount() {
        if (backend.ready) { showFirebaseAccount(); return }
        if (!BuildConfig.DEBUG) { showBackendInfo(); return }
        if(previewUser.isNotBlank()) {
            AlertDialog.Builder(this).setTitle(t("accountLogin")+" · "+previewUser)
                .setMessage(t("previewMode")+"\n"+t("previewNotSynced"))
                .setPositiveButton(t("signOut")){_,_->previewUser="";prefs.edit().remove("previewUser").apply();render()}
                .setNegativeButton(t("cancelPreview"),null).show()
            return
        }
        val body=col().apply {setPadding(px(15),px(10),px(15),px(6))}
        val username=editField(body,t("usernameOrEmail"),"","")
        val password=editField(body,t("password"),"","")
        password.inputType=InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_PASSWORD
        AlertDialog.Builder(this).setTitle(t("accountLogin"))
            .setMessage(t("previewNotSynced"))
            .setView(body)
            .setPositiveButton(t("login"),null)
            .setNeutralButton(t("localRegister")){_,_->showRegister()}
            .setNegativeButton(t("cancelPreview"),null)
            .create().also{dlg->
                dlg.setOnShowListener { dlg.getButton(AlertDialog.BUTTON_POSITIVE).setOnClickListener {
                    val name=username.text.toString().trim().lowercase(Locale.ROOT)
                    val pass=password.text.toString()
                    val account = JSONObject(prefs.getString("previewAccounts", "{}") ?: "{}").optJSONObject(name)
                    val valid = name != "limba" && account != null && MessageDigest.isEqual(
                        hashPassword(pass, account.optString("salt")).toByteArray(),
                        account.optString("hash").toByteArray()
                    )
                    if(!valid)toast(t("loginInvalid")) else {
                        previewUser=name;prefs.edit().putString("previewUser",name).apply();dlg.dismiss();render();toast(t("welcomePreview"))
                    }
                } }
                dlg.show()
            }
    }

    private fun submitDealerAfterVerification() {
        if (cloudUser?.isEmailVerified != true || dealerApplication?.optString("status") != "verificationRequired" ||
            submittingDealerApplication) return
        submittingDealerApplication = true
        backend.submitVerifiedDealerApplication { submittingDealerApplication = false }
    }

    private fun showFirebaseAccount() {
        val user = cloudUser
        if (user != null) {
            backend.mayReviewDealers { reviewer ->
                if (cloudUser?.uid != user.uid || isFinishing || isDestroyed) return@mayReviewDealers
                val status = dealerApplication?.optString("status")
                val label = t(when (status) {
                    "verificationRequired" -> "dealerVerificationRequired"
                    "pending" -> "dealerPending"
                    "approved" -> "dealerApproved"
                    "rejected" -> "dealerRejected"
                    else -> "privateSeller"
                })
                val actions = mutableListOf<Pair<String, () -> Unit>>(
                    "myAds" to { navigate("mine") },
                    "messages" to { navigate("messages") },
                    "notifications" to { navigate("notifications") },
                )
                if (!user.isEmailVerified) {
                    actions.add("refreshVerification" to {
                        backend.refreshVerification { verified ->
                            if (verified) submitDealerAfterVerification()
                            toast(t(if (verified) "verifiedBadge" else "notVerified"))
                            render()
                        }
                    })
                    actions.add("sendVerification" to { backend.sendVerification { error -> toast(error ?: t("checkEmail")) } })
                }
                if (status == null || status == "rejected") actions.add("dealerApply" to ::showDealerApplication)
                if (reviewer) actions.add("dealerReview" to ::showDealerReview)
                actions.add("signOut" to { backend.auth?.signOut() })
                AlertDialog.Builder(this).setTitle("${user.email ?: "Limba"}\n$label")
                    .setItems(actions.map { t(it.first) }.toTypedArray()) { _, chosen -> actions[chosen].second() }
                    .setNegativeButton(t("cancel"), null).show()
            }
            return
        }
        AlertDialog.Builder(this).setTitle(t("accountLogin"))
            .setItems(arrayOf(t("login"),t("register"),t("forgotPassword"))) { _,which ->
                when(which){
                    0->showFirebaseAuthForm("login")
                    1->showFirebaseAuthForm("register")
                    2->showFirebaseAuthForm("reset")
                }
            }.setNegativeButton(t("cancel"),null).show()
    }
    private fun showDealerApplication() {
        val form = col().apply { setPadding(px(18), px(9), px(18), px(9)) }
        val company = editField(form, t("dealerCompany"), dealerApplication?.optString("companyName").orEmpty(), "")
        company.filters = arrayOf(android.text.InputFilter.LengthFilter(120))
        val dialog = AlertDialog.Builder(this).setTitle(t("dealerApply")).setView(form)
            .setPositiveButton(t("dealerSend"), null).setNegativeButton(t("cancel"), null).create()
        dialog.setOnShowListener {
            val submit = dialog.getButton(AlertDialog.BUTTON_POSITIVE)
            submit.setOnClickListener {
                val name = company.text.toString().trim()
                if (name.length < 2) {
                    company.error = t("dealerCompany")
                    return@setOnClickListener
                }
                submit.isEnabled = false
                backend.saveDealerApplication(name) { error ->
                    submit.isEnabled = true
                    if (error == null) {
                        dialog.dismiss()
                        toast(t(if (cloudUser?.isEmailVerified == true) "dealerPending" else "dealerVerificationRequired"))
                    } else toast(t("dealerSaveError"))
                }
            }
        }
        dialog.show()
    }

    private fun showDealerReview() {
        backend.pendingDealers { rows, error ->
            if (isFinishing || isDestroyed) return@pendingDealers
            val dialog = AlertDialog.Builder(this).setTitle(t("dealerReview")).setNegativeButton(t("cancel"), null)
            if (error != null || rows.isEmpty()) {
                dialog.setMessage(t(if (error == null) "dealerQueueEmpty" else "dealerLoadError")).show()
                return@pendingDealers
            }
            val choices = rows.map { it.optString("companyName") + "\n" + it.optString("email") }.toTypedArray()
            dialog.setItems(choices) { _, selected ->
                val application = rows[selected]
                fun review(approved: Boolean) {
                    backend.reviewDealer(application.optString("id"), approved) { saveError ->
                        if (saveError != null) toast(t("dealerSaveError"))
                        showDealerReview()
                    }
                }
                AlertDialog.Builder(this).setTitle(application.optString("companyName"))
                    .setMessage(application.optString("email"))
                    .setPositiveButton(t("dealerApprove")) { _, _ -> review(true) }
                    .setNeutralButton(t("dealerReject")) { _, _ -> review(false) }
                    .setNegativeButton(t("cancel"), null).show()
            }.show()
        }
    }

    private fun showFirebaseAuthForm(mode:String) {
        val layout=col().apply { setPadding(px(16),px(8),px(16),px(8)) }
        val email=editField(layout,t("email"),"","name@example.com")
        email.inputType=InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_EMAIL_ADDRESS
        val password=if(mode!="reset")editField(layout,t("password"),"","")else null
        password?.inputType=InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_PASSWORD
        val confirm=if(mode=="register")editField(layout,t("confirmPassword"),"","")else null
        confirm?.inputType=InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_PASSWORD
        val accountType = if (mode == "register") {
            layout.addView(label(t("accountType")))
            Spinner(this).apply {
                background = c(paper, 11, border)
                contentDescription = t("accountType")
                adapter = ArrayAdapter(this@MainActivity, android.R.layout.simple_spinner_dropdown_item,
                    listOf(t("privateSeller"), t("dealer")))
                layout.addView(this, lp(-1, 48))
            }
        } else null
        val companySection = col()
        val company = if (accountType != null) {
            layout.addView(companySection)
            companySection.visibility = View.GONE
            val field = editField(companySection, t("dealerCompany"), "", "")
            field.filters = arrayOf(android.text.InputFilter.LengthFilter(120))
            accountType.onItemSelectedListener = object : AdapterView.OnItemSelectedListener {
                override fun onItemSelected(parent: AdapterView<*>?, view: View?, position: Int, id: Long) {
                    companySection.visibility = if (position == 1) View.VISIBLE else View.GONE
                }

                override fun onNothingSelected(parent: AdapterView<*>?) {
                    companySection.visibility = View.GONE
                }
            }
            field
        } else null
        val title=when(mode){"register"->t("register");"reset"->t("forgotPassword");else->t("login")}
        AlertDialog.Builder(this).setTitle(title).setView(layout)
            .setPositiveButton(title,null).setNegativeButton(t("cancel"),null)
            .create().also { dialog ->
                dialog.setOnShowListener {
                    val positive=dialog.getButton(AlertDialog.BUTTON_POSITIVE)
                    positive.setOnClickListener {
                        val address=email.text.toString().trim()
                        val pass=password?.text?.toString() ?: ""
                        if(!android.util.Patterns.EMAIL_ADDRESS.matcher(address).matches()) {
                            toast(t("requiredFields"));return@setOnClickListener
                        }
                        if(mode=="register" && pass.length<8) {
                            toast(t("minPassword"));return@setOnClickListener
                        }
                        if(mode=="login" && pass.isEmpty()) {
                            toast(t("requiredFields"));return@setOnClickListener
                        }
                        if(mode=="register" && pass != confirm?.text.toString()) {
                            toast(t("passwordsMismatch"));return@setOnClickListener
                        }
                        val dealerName = if (accountType?.selectedItemPosition == 1) company?.text?.toString()?.trim().orEmpty() else null
                        if (dealerName != null && dealerName.length < 2) {
                            company?.error = t("dealerCompany")
                            return@setOnClickListener
                        }
                        positive.isEnabled=false
                        val done:(String?)->Unit={ error ->
                            positive.isEnabled=true
                            if(error!=null)toast(error)else{
                                dialog.dismiss();toast(if(mode=="register"||mode=="reset")t("checkEmail") else t("login"))
                            }
                        }
                        when(mode){
                            "register"->backend.register(address,pass,dealerName,done)
                            "reset"->backend.resetPassword(address,done)
                            else->backend.signIn(address,pass,done)
                        }
                    }
                }
                dialog.show()
            }
    }
    private fun showRegister() {
        val layout=col().apply {setPadding(px(16),px(8),px(16),px(6))}
        val username=editField(layout,t("username"),"", "3–32")
        val pass=editField(layout,t("password"),"",t("minPassword"))
        val confirm=editField(layout,t("confirmPassword"),"","")
        pass.inputType=InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_PASSWORD
        confirm.inputType=InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_PASSWORD
        AlertDialog.Builder(this).setTitle(t("localRegister")).setMessage(t("previewNotSynced"))
            .setView(layout).setPositiveButton(t("register"),null).setNegativeButton(t("cancelPreview"),null)
            .create().also{dlg->
                dlg.setOnShowListener { dlg.getButton(AlertDialog.BUTTON_POSITIVE).setOnClickListener {
                    val name=username.text.toString().trim().lowercase(Locale.ROOT)
                    val password=pass.text.toString()
                    val all=JSONObject(prefs.getString("previewAccounts","{}")?:"{}")
                    when {
                        !name.matches(Regex("[a-z0-9._-]{3,32}"))||name=="limba" ->toast(t("requiredFields"))
                        password.length<6 ->toast(t("minPassword"))
                        password!=confirm.text.toString() ->toast(t("passwordsMismatch"))
                        all.has(name) ->toast(t("accountExists"))
                        else->{
                            val salt=ByteArray(16).also { SecureRandom().nextBytes(it) }.joinToString(""){ "%02x".format(it.toInt() and 255) }
                            all.put(name,JSONObject().put("salt",salt).put("hash",hashPassword(password,salt)))
                            prefs.edit().putString("previewAccounts",all.toString()).putString("previewUser",name).apply()
                            previewUser=name;dlg.dismiss();render();toast(t("previewRegistered"))
                        }
                    }
                } }
                dlg.show()
            }
    }
    private fun passportField(parent: LinearLayout, heading: String, value: String, maxChars: Int): EditText {
        parent.addView(label(heading))
        val field = EditText(this).apply {
            setText(value); textSize = 14f; minLines = 2; maxLines = 4
            setTextColor(ink); setHintTextColor(muted)
            hint = t("sellerClaims")
            inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_FLAG_MULTI_LINE
            filters = arrayOf(android.text.InputFilter.LengthFilter(maxChars))
            setPadding(px(12),px(9),px(12),px(9))
            background = c(paper, 11, border)
        }
        parent.addView(field, lp(-1, 83))
        return field
    }

    private fun showCarForm(existing: JSONObject? = null) {
        val isPreview = previewUser.isNotBlank()
        if(!isPreview && cloudUser==null){showAccount();return}
        if(!isPreview && cloudUser?.isEmailVerified!=true){
            toast(t("verifiedRequired"));showAccount();return
        }
        val col=col().apply {setPadding(px(18),px(6),px(18),px(14))}
        col.addView(text(if(isPreview)t("previewMode")else t("vehicleProfile"),12f,orange,true));col.addView(space(8))
        val makeList=mutableListOf<String>()
        brands.optJSONArray("makes")?.let {arr->for(i in 0 until arr.length())makeList.add(arr.optString(i))}
        col.addView(label(t("make")))
        val makeField=autoComplete(existing?.optString("make")?:"",t("make"),makeList) { };col.addView(makeField,lp(-1,48))
        col.addView(label(t("model")))
        val initialModels=mutableListOf<String>()
        brands.optJSONObject("models")?.optJSONArray(canonicalBrand(makeField.text.toString()))?.let { arr ->
            for(i in 0 until arr.length())initialModels.add(arr.optString(i))
        }
        val modelField=autoComplete(existing?.optString("model")?:"",t("model"),initialModels){};col.addView(modelField,lp(-1,48))
        val extension=editField(col,t("modelExtension"),existing?.optString("modelExtension")?:"",t("modelExtensionHint"))
        makeField.addTextChangedListener(object:android.text.TextWatcher {
            override fun beforeTextChanged(s:CharSequence?,start:Int,count:Int,after:Int){}
            override fun onTextChanged(s:CharSequence?,start:Int,before:Int,count:Int){
                val arr=brands.optJSONObject("models")?.optJSONArray(canonicalBrand(s.toString()))
                val choices=mutableListOf<String>();if(arr!=null)for(i in 0 until arr.length())choices.add(arr.optString(i))
                modelField.setAdapter(ArrayAdapter(this@MainActivity,android.R.layout.simple_dropdown_item_1line,choices))
            }
            override fun afterTextChanged(s:android.text.Editable?){}
        })
        val year=editField(col,t("firstReg"),existing?.optString("year")?:"","2013",true)
        val mileage=editField(col,t("mileage"),existing?.optString("mileage")?:"","km",true)
        val power=editField(col,t("power"),existing?.optString("power")?:"","PS",true)
        val engineName=editField(col,t("engineName"),existing?.optString("engineName")?:"",t("engineInfo"))
        val engineCapacity=editField(col,t("engineCapacity"),existing?.optString("engineCapacity")?.takeUnless{it=="null"}?:"","cm³",true)
        val price=editField(col,t("price"),existing?.optString("price")?:"","€",true)
        val city=editField(col,t("location"),existing?.optString("city")?:"",t("location"))
        fun spinner(label:String,values:List<Pair<String,String>>):Spinner {
            col.addView(this.label(label));return Spinner(this).apply {
                adapter=ArrayAdapter(this@MainActivity,android.R.layout.simple_spinner_dropdown_item,values.map{it.second})
                background=c(paper,12,border);col.addView(this,lp(-1,51));tag=values.map { it.first }
            }
        }
        val country=spinner(t("country"),countries.map { it.first to (it.second+" "+it.third) })
        existing?.let {country.setSelection(countries.indexOfFirst{c->c.first==it.optString("country")}.coerceAtLeast(0))}
        val fuels=listOf("petrol","diesel","hybrid","electric")
        val fuel=spinner(t("fuel"),fuels.map { it to t(it) })
        existing?.let {fuel.setSelection(fuels.indexOf(it.optString("fuel")).coerceAtLeast(0))}
        val gearbox=listOf("manual","automatic")
        val trans=spinner(t("transmission"),gearbox.map { it to t(it) })
        existing?.let {trans.setSelection(gearbox.indexOf(it.optString("transmission")).coerceAtLeast(0))}
        val bodies=listOf("suv","sedan","wagon","hatchback","coupe")
        val body=spinner(t("body"),bodies.map { it to t(it) })
        existing?.let {body.setSelection(bodies.indexOf(it.optString("body")).coerceAtLeast(0))}
        val conditions=listOf("used","new")
        val condition=spinner(t("carCondition"),conditions.map { it to t(if(it=="used")"conditionUsed"else "conditionNew") })
        existing?.let {condition.setSelection(conditions.indexOf(it.optString("condition")).coerceAtLeast(0))}
        val accidents=listOf("unknown","no","yes")
        val accident=spinner(t("accidentCar"),accidents.map { it to t(if(it=="unknown")"accidentUnknown"else if(it=="yes")"accidentYes"else "accidentNo") })
        existing?.let {accident.setSelection(accidents.indexOf(it.optString("accidentStatus")).coerceAtLeast(0))}
        val note=editField(col,t("conditionShort"),existing?.optString("conditionNote")?:"",t("conditionShortHint"))
        col.addView(text(t("vehiclePass"),19f,ink,true))
        col.addView(text(t("sellerClaims"),12f,muted))
        val service=passportField(col,t("serviceHistory"),existing?.optString("serviceHistory")?:"",500)
        val mods=passportField(col,t("tuningDetails"),existing?.optString("modificationNotes")?:"",500)
        val docs=passportField(col,t("documentNotes"),existing?.optString("documentNotes")?:"",240)
        val report = existing?.optJSONObject("batteryReport")
        val batteryGroup = col().apply { visibility = if (fuel.selectedItemPosition == fuels.indexOf("electric")) View.VISIBLE else View.GONE }
        batteryGroup.addView(label(t("batteryReport")))
        val batteryHealth = editField(batteryGroup, t("batteryHealth"), report?.optString("health").orEmpty(), "%").apply {
            inputType = InputType.TYPE_CLASS_NUMBER or InputType.TYPE_NUMBER_FLAG_DECIMAL
        }
        val batteryDate = editField(batteryGroup, t("batteryMeasuredAt"), report?.optString("measuredAt").orEmpty(), "YYYY-MM-DD")
        val batteryIssuer = editField(batteryGroup, t("batteryIssuer"), report?.optString("issuer").orEmpty(), t("batteryIssuer"))
        val batteryUrl = editField(batteryGroup, t("batteryUrl"), report?.optString("url").orEmpty(), "https://").apply {
            inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_URI
        }
        col.addView(batteryGroup)
        fuel.onItemSelectedListener = object : android.widget.AdapterView.OnItemSelectedListener {
            override fun onNothingSelected(parent: android.widget.AdapterView<*>?) {}
            override fun onItemSelected(parent: android.widget.AdapterView<*>?, view: View?, position: Int, id: Long) {
                batteryGroup.visibility = if (fuels[position] == "electric") View.VISIBLE else View.GONE
            }
        }
        val approvedDealer = dealerApplication?.optString("status") == "approved"
        val sellerTypes = if (approvedDealer) listOf("privateSeller", "dealer") else listOf("privateSeller")
        val seller=spinner(t("sellerType"),sellerTypes.map { it to t(it) })
        seller.setSelection(existing?.let { sellerTypes.indexOf(it.optString("sellerType")).coerceAtLeast(0) }
            ?: if (approvedDealer) 1 else 0)
        if (!approvedDealer && !isPreview) col.addView(text(t("dealerListingHint"), 13f, muted))
        col.addView(label(t("vehicleDescription")))
        val desc=EditText(this).apply { setTextColor(ink);minLines=3;maxLines=6;setPadding(px(13),px(10),px(13),px(10));background=c(paper,12,border) }
        desc.setText(existing?.optString("description") ?: "")
        col.addView(desc,lp(-1,110))
        val photoControls = col()
        val photoFields = linkedMapOf<Int, Pair<Spinner, EditText>>()
        val categories = listOf("") + photoKinds
        fun showPhotoFields(slots: List<Pair<Int, String>>, initial: JSONObject?) {
            photoFields.clear()
            photoControls.removeAllViews()
            for ((slot, source) in slots) {
                val value = initial?.optJSONObject(slot.toString())
                photoControls.addView(label("${t("photoNumber")} ${slot + 1}"))
                photoControls.addView(ImageView(this).apply {
                    scaleType = ImageView.ScaleType.CENTER_CROP
                    contentDescription = "${t("photoNumber")} ${slot + 1}"
                    com.bumptech.glide.Glide.with(this@MainActivity).load(source).centerCrop().into(this)
                }, lp(-1, 108))
                val type = Spinner(this).apply {
                    background = c(paper, 11, border)
                    contentDescription = t("photoDetails")
                    adapter = ArrayAdapter(this@MainActivity, android.R.layout.simple_spinner_dropdown_item,
                        categories.map { if (it.isBlank()) t("noInfo") else photoKindLabel(it) })
                    setSelection(categories.indexOf(value?.optString("kind").orEmpty()).coerceAtLeast(0))
                }
                photoControls.addView(space(6))
                photoControls.addView(type, lp(-1, 48))
                val caption = editField(photoControls, t("photoNote"), value?.optString("note").orEmpty(), t("photoNote"))
                caption.filters = arrayOf(android.text.InputFilter.LengthFilter(160))
                photoFields[slot] = type to caption
            }
        }
        if(!isPreview && existing==null){
            clearPickedPhotos()
            col.addView(space(12))
            col.addView(text(t("photoGuide"), 13f, muted))
            col.addView(btn(t("choosePhoto"), false) { pickListingPhotos() })
            col.addView(btn(permissionText("Foto aufnehmen", "Take photo"), false) { requestListingCamera() })
            col.addView(btn(permissionText("Fotoauswahl löschen", "Clear selected photos"), false) {
                clearPickedPhotos()
                updatePickedPhotos()
            })
            pickedImagesLabel=text("0 / 6",12f,muted)
            col.addView(pickedImagesLabel)
            renderPickedPhotoFields = {
                val current = JSONObject()
                for ((slot, fields) in photoFields) {
                    val kind = categories[fields.first.selectedItemPosition.coerceIn(categories.indices)]
                    current.put(slot.toString(), JSONObject().put("kind", kind).put("note", fields.second.text.toString()))
                }
                showPhotoFields(pickedImages.mapIndexed { index, uri -> index to uri.toString() }, current)
            }
        } else if (!isPreview && existing != null) {
            showPhotoFields(listingPhotos(existing), existing.optJSONObject("photoDetails"))
        }
        col.addView(photoControls)
        val scroll=ScrollView(this);scroll.addView(col)
        AlertDialog.Builder(this).setTitle(t("vehicleProfile")).setView(scroll)
            .setPositiveButton(if(isPreview)t("savePreviewCar")else if(existing!=null)t("editAd")else t("publish"),null)
            .setNegativeButton(t("cancelPreview"),null)
            .create().also{dlg->
                dlg.setOnDismissListener {
                    renderPickedPhotoFields = null
                    pickedImagesLabel = null
                    clearPickedPhotos()
                }
                dlg.setOnShowListener { dlg.getButton(AlertDialog.BUTTON_POSITIVE).setOnClickListener {
                    val mk=canonicalBrand(makeField.text.toString());val mdl=modelField.text.toString().trim()
                     val modelExtension=extension.text.toString().trim().replace(Regex("\\s+")," ")
                     val fullTitle=listOf(mk,mdl,modelExtension).filter{it.isNotBlank()}.joinToString(" ")
                    val yr=year.text.toString().toIntOrNull();val km=mileage.text.toString().toIntOrNull();val hp=power.text.toString().toIntOrNull();val eur=price.text.toString().toIntOrNull()
                    val town=city.text.toString().trim();val description=desc.text.toString().trim()
                    val ccmText=engineCapacity.text.toString().trim()
                    val ccm=ccmText.toIntOrNull()
                    if(engineName.text.length>80||(ccmText.isNotEmpty()&&(ccm==null||ccm !in 0..12000))){toast(t("requiredFields"));return@setOnClickListener}
                    if(mk.length !in 2..35||mdl.length !in 1..65||modelExtension.length>40||fullTitle.length>110||yr==null||yr !in 1950..(java.util.Calendar.getInstance().get(java.util.Calendar.YEAR)+1)||km==null||km !in 0..1500000||hp==null||hp !in 1..2000||eur==null||eur !in 1..999999999||town.isBlank()||description.length<15){toast(t("requiredFields"));return@setOnClickListener}
                    val car=JSONObject().put("id",existing?.optString("id") ?: "preview-"+System.currentTimeMillis())
                        .put("uid",if(isPreview)previewUser else cloudUser?.uid ?: "")
                        .put("make",mk).put("model",mdl).put("modelExtension",modelExtension)
                        .put("clearModelExtension",existing?.optString("modelExtension")?.isNotBlank()==true && modelExtension.isBlank())
                        .put("year",yr).put("mileage",km).put("power",hp).put("price",eur)
                        .put("engineName",engineName.text.toString().trim().take(80))
                        .put("engineCapacity",ccm ?: JSONObject.NULL)
                        .put("clearEngineName",existing?.optString("engineName")?.isNotBlank()==true && engineName.text.isBlank())
                        .put("clearEngineCapacity",existing?.has("engineCapacity")==true && !existing.isNull("engineCapacity") && ccm==null)
                        .put("city",town).put("country",countries[country.selectedItemPosition].first).put("fuel",fuels[fuel.selectedItemPosition])
                        .put("transmission",gearbox[trans.selectedItemPosition]).put("body",bodies[body.selectedItemPosition])
                        .put("condition",conditions[condition.selectedItemPosition]).put("accidentStatus",accidents[accident.selectedItemPosition])
                        .put("conditionNote",note.text.toString().trim().take(240)).put("description",description.take(3000))
                        .put("serviceHistory",service.text.toString().trim().take(500))
                        .put("modificationNotes",mods.text.toString().trim().take(500))
                        .put("documentNotes",docs.text.toString().trim().take(240))
                        .put("clearServiceHistory",existing?.optString("serviceHistory")?.isNotBlank()==true && service.text.isBlank())
                        .put("clearModificationNotes",existing?.optString("modificationNotes")?.isNotBlank()==true && mods.text.isBlank())
                        .put("clearDocumentNotes",existing?.optString("documentNotes")?.isNotBlank()==true && docs.text.isBlank())
                        .put("sellerType",sellerTypes[seller.selectedItemPosition])
                        .put("contactEmail","")
                    val photos = JSONObject()
                    for ((slot, fields) in photoFields) {
                        val category = categories[fields.first.selectedItemPosition.coerceIn(categories.indices)]
                        val caption = fields.second.text.toString().trim()
                        if (category.isNotBlank() || caption.isNotBlank()) {
                            photos.put(slot.toString(), JSONObject().put("kind", category.ifBlank { "other" }).put("note", caption))
                        }
                    }
                    if (photos.length() > 0) car.put("photoDetails", photos)
                    else if (existing?.has("photoDetails") == true) car.put("photoDetails", JSONObject.NULL)
                    val rawHealth = batteryHealth.text.toString().trim()
                    val rawDate = batteryDate.text.toString().trim()
                    val issuer = batteryIssuer.text.toString().trim()
                    val url = batteryUrl.text.toString().trim()
                    if (car.optString("fuel") == "electric" && listOf(rawHealth, rawDate, issuer, url).any { it.isNotBlank() }) {
                        val health = rawHealth.replace(',', '.').toDoubleOrNull()
                        val date = runCatching { LocalDate.parse(rawDate) }.getOrNull()
                        if (health == null || !health.isFinite() || health !in 0.0..100.0 || date == null ||
                            rawDate.length != 10 || date.isAfter(LocalDate.now()) || issuer.length !in 1..120 ||
                            url.length > 500 || (url.isNotBlank() && !validHttps(url))) {
                            toast(t("batteryInvalid")); return@setOnClickListener
                        }
                        val data = JSONObject().put("health", health).put("measuredAt", rawDate).put("issuer", issuer)
                        if (url.isNotBlank()) data.put("url", url)
                        car.put("batteryReport", data)
                    } else if (existing?.has("batteryReport") == true) {
                        car.put("batteryReport", JSONObject.NULL)
                    }
                    if (isPreview) {
                        existing?.let { previewCars.remove(it) }
                        previewCars.add(0,car);savePreviewCars();dlg.dismiss();navigate("mine")
                        toast(t("previewSaved"))
                    } else {
                        if(existing==null && pickedImages.isEmpty()) {
                            toast(t("listingPhotos"));return@setOnClickListener
                        }
                        val submit=dlg.getButton(AlertDialog.BUTTON_POSITIVE)
                        val cancel = dlg.getButton(AlertDialog.BUTTON_NEGATIVE)
                        submit.isEnabled=false
                        cancel.isEnabled=false
                        dlg.setCancelable(false)
                        val done:(String?)->Unit={error->
                            submit.isEnabled=true
                            cancel.isEnabled=true
                            dlg.setCancelable(true)
                            if(error!=null)toast(error)else{
                                pickedImages.clear();pickedImagesLabel=null
                                dlg.dismiss();navigate("mine");toast(t("carPublished"))
                            }
                        }
                        if(existing!=null) backend.update(car,done)
                        else backend.publish(car,pickedImages.toList(),done)
                    }
                } }
                dlg.show()
            }
    }
    private fun renderMine() {
        val main=container();toolbar(main,t("myAds"),{navigate("home")})
        val content=col().apply {setPadding(px(19),px(30),px(19),px(30))}
        content.addView(text(t("myAds"),23f,ink,true));content.addView(space(11))
        val own=if(previewUser.isNotBlank())
            previewCars.filter { it.optString("uid")==previewUser }
            else ownCars.toList()
        if(own.isEmpty())emptyState(content,t("noOwnCars"))
        own.forEach { car ->
            content.addView(previewCard(car));content.addView(space(6))
            if(previewUser.isBlank()) {
                content.addView(text(t("statusLabel")+": "+t("status"+car.optString("status","active").replaceFirstChar{it.uppercase()}),
                    13f,muted))
                content.addView(btn(t("editAd"),false) {showCarForm(car)})
                listOf("active","paused","sold").forEach { status ->
                    if(status!=car.optString("status")) content.addView(btn(t("status"+status.replaceFirstChar{it.uppercase()}),false){
                        backend.status(car,status){error->if(error!=null)toast(error)}
                    })
                }
            }else content.addView(btn(t("editAd"),false){showCarForm(car)})
            content.addView(btn(t("removeAd"),false) {
                AlertDialog.Builder(this).setTitle(t("removeAd")).setMessage(t("removeConfirm"))
                    .setPositiveButton(t("removeAd")){_,_->
                        if(previewUser.isNotBlank()){
                            previewCars.remove(car);savePreviewCars();renderMine()
                        } else backend.remove(car){error->if(error!=null)toast(error)}
                    }
                    .setNegativeButton(t("cancelPreview"),null).show()
            });content.addView(space(16))
        }
        if(previewUser.isNotBlank()){content.addView(space(10));content.addView(text(t("previewNotSynced"),12f,muted))}
        body(main,content);navigation(main)
    }
    private fun showBackendInfo() {
        AlertDialog.Builder(this).setTitle(t("registerToSell"))
            .setMessage(t("authUnavailable"))
            .setPositiveButton("OK",null).show()
    }
    private fun permissionText(german: String, english: String) = if (locale == "de") german else english

    private fun updatePickedPhotos() {
        pickedImagesLabel?.text = "${pickedImages.size} / 6"
        renderPickedPhotoFields?.invoke()
    }

    private fun clearPickedPhotos() {
        pickedImages.clear()
        pendingCameraPhoto?.delete()
        pendingCameraPhoto = null
        stagedCameraFiles.forEach { it.delete() }
        stagedCameraFiles.clear()
    }

    private fun hasPhotoSpace(): Boolean {
        if (pickedImages.size < 6) return true
        toast(permissionText("Du kannst bis zu sechs Fotos auswählen.", "You can select up to six photos."))
        return false
    }

    private fun pickListingPhotos() {
        if (!hasPhotoSpace()) return
        val remaining = 6 - pickedImages.size
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            val picker = Intent(MediaStore.ACTION_PICK_IMAGES).setType("image/*")
            if (remaining > 1) picker.putExtra(MediaStore.EXTRA_PICK_IMAGES_MAX, remaining)
            try {
                startActivityForResult(picker, pickPhotosRequest)
                return
            } catch (_: ActivityNotFoundException) {
                // Devices without the system picker can use the document selector.
            }
        }
        val documents = Intent(Intent.ACTION_OPEN_DOCUMENT).apply {
            type = "image/*"
            addCategory(Intent.CATEGORY_OPENABLE)
            putExtra(Intent.EXTRA_ALLOW_MULTIPLE, remaining > 1)
        }
        try {
            startActivityForResult(documents, pickPhotosRequest)
        } catch (_: ActivityNotFoundException) {
            toast(t("featureUnavailable"))
        }
    }

    private fun requestListingCamera() {
        if (!hasPhotoSpace()) return
        if (checkSelfPermission(Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED) {
            launchListingCamera()
        } else if (prefs.getBoolean("limbaCameraPermissionRequested", false) &&
            !shouldShowRequestPermissionRationale(Manifest.permission.CAMERA)) {
            AlertDialog.Builder(this).setTitle(permissionText("Kamera", "Camera"))
                .setMessage(permissionText("Erlaube den Kamerazugriff in den App-Einstellungen.", "Allow camera access in app settings."))
                .setPositiveButton(t("settings")) { _, _ ->
                    startActivity(Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:$packageName")))
                }
                .setNegativeButton(t("cancel"), null).show()
        } else {
            prefs.edit().putBoolean("limbaCameraPermissionRequested", true).apply()
            requestPermissions(arrayOf(Manifest.permission.CAMERA), cameraPermissionRequest)
        }
    }

    private fun launchListingCamera() {
        if (pickedImagesLabel == null || !hasPhotoSpace()) return
        runCatching {
            val directory = File(cacheDir, "listing-photos").apply { mkdirs() }
            val photo = File.createTempFile("vehicle-", ".jpg", directory)
            pendingCameraPhoto = photo
            val uri = FileProvider.getUriForFile(this, "$packageName.listing-photos", photo)
            val capture = Intent(MediaStore.ACTION_IMAGE_CAPTURE).apply {
                putExtra(MediaStore.EXTRA_OUTPUT, uri)
                clipData = ClipData.newRawUri("listing-photo", uri)
                addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_GRANT_WRITE_URI_PERMISSION)
            }
            startActivityForResult(capture, takePhotoRequest)
        }.onFailure {
            pendingCameraPhoto?.delete()
            pendingCameraPhoto = null
            toast(t("featureUnavailable"))
        }
    }

    private fun deviceNotificationsAllowed(): Boolean {
        val manager = getSystemService(NotificationManager::class.java)
        return prefs.getBoolean("limbaNotificationOptIn", false) && manager.areNotificationsEnabled() &&
            (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU ||
                checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED)
    }

    private fun requestDeviceNotifications() {
        prefs.edit().putBoolean("limbaNotificationOptIn", true).apply()
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
            checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED &&
            (!prefs.getBoolean("limbaNotificationPermissionRequested", false) ||
                shouldShowRequestPermissionRationale(Manifest.permission.POST_NOTIFICATIONS))) {
            prefs.edit().putBoolean("limbaNotificationPermissionRequested", true).apply()
            requestPermissions(arrayOf(Manifest.permission.POST_NOTIFICATIONS), notificationPermissionRequest)
        } else if (!deviceNotificationsAllowed()) {
            startActivity(Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).putExtra(Settings.EXTRA_APP_PACKAGE, packageName))
        } else {
            syncDeviceNotificationListener()
            if (screen == "notifications") render()
        }
    }

    private fun syncDeviceNotificationListener() {
        val owner = cloudUser?.uid?.takeIf { deviceNotificationsAllowed() }
        if (owner == notificationOwner && (owner == null || deviceNotifications != null)) return
        deviceNotifications?.remove()
        deviceNotifications = null
        notificationOwner = owner
        if (owner == null) {
            getSystemService(NotificationManager::class.java).cancel(1)
            return
        }

        var seen: Set<String>? = null
        deviceNotifications = backend.watchNotifications { items, error ->
            if (error != null || cloudUser?.uid != owner || !deviceNotificationsAllowed()) return@watchNotifications
            val current = items.mapTo(mutableSetOf()) { it.optString("id") }
            val previous = seen
            seen = current
            if (previous != null && screen != "notifications" &&
                items.any { !it.optBoolean("read") && it.optString("id") !in previous }) {
                postSearchNotification()
            }
        }
    }

    private fun postSearchNotification() {
        val manager = getSystemService(NotificationManager::class.java)
        manager.createNotificationChannel(NotificationChannel(notificationChannelId, t("notifications"), NotificationManager.IMPORTANCE_DEFAULT))
        val open = Intent(this, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP
            putExtra(openNotificationsExtra, true)
        }
        val tap = PendingIntent.getActivity(this, 0, open, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
        manager.notify(1, Notification.Builder(this, notificationChannelId)
            .setSmallIcon(R.drawable.ic_limba_notification)
            .setContentTitle("Limba")
            .setContentText(permissionText("Neue Treffer für deine gespeicherten Suchen", "New matches for your saved searches"))
            .setAutoCancel(true)
            .setVisibility(Notification.VISIBILITY_PRIVATE)
            .setContentIntent(tap)
            .build())
    }

    override fun onResume() {
        super.onResume()
        if (::backend.isInitialized) syncDeviceNotificationListener()
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        if (intent.getBooleanExtra(openNotificationsExtra, false) && cloudUser != null) navigate("notifications")
    }

    override fun onDestroy() {
        conversationDialog?.dismiss()
        screenRegistration?.remove()
        deviceNotifications?.remove()
        searchRegistrations.forEach { it.remove() }
        countryRegistration?.remove()
        dealerRegistration?.remove()
        clearPickedPhotos()
        if (::backend.isInitialized) backend.close()
        super.onDestroy()
    }

    override fun onRequestPermissionsResult(requestCode: Int, permissions: Array<out String>, grantResults: IntArray) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        val granted = grantResults.firstOrNull() == PackageManager.PERMISSION_GRANTED
        when (requestCode) {
            cameraPermissionRequest -> if (granted) launchListingCamera()
                else toast(permissionText("Du kannst weiterhin Fotos aus der Galerie wählen.", "You can still select photos from your gallery."))
            notificationPermissionRequest -> if (granted) {
                syncDeviceNotificationListener()
                if (screen == "notifications") render()
            }
        }
    }

    @Deprecated("Activity result API retained for compatibility with Activity base class")
    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        super.onActivityResult(requestCode, resultCode, data)
        when (requestCode) {
            takePhotoRequest -> {
                val photo = pendingCameraPhoto ?: return
                pendingCameraPhoto = null
                if (resultCode == RESULT_OK && photo.length() > 0 && pickedImagesLabel != null && hasPhotoSpace()) {
                    stagedCameraFiles.add(photo)
                    pickedImages.add(FileProvider.getUriForFile(this, "$packageName.listing-photos", photo))
                    updatePickedPhotos()
                } else photo.delete()
            }
            pickPhotosRequest -> {
                if (resultCode != RESULT_OK || data == null || pickedImagesLabel == null) return
                val received = data.clipData?.let { clip -> (0 until clip.itemCount).map { clip.getItemAt(it).uri } }
                    ?: listOfNotNull(data.data)
                pickedImages.addAll(received.distinct().filterNot { it in pickedImages }.take(6 - pickedImages.size))
                updatePickedPhotos()
            }
        }
    }

    override fun onBackPressed() { goBack() }
    override fun onKeyDown(keyCode:Int,event:KeyEvent):Boolean {
        if(screen=="swipe"){
            when(keyCode){
                KeyEvent.KEYCODE_DPAD_LEFT->{if(swipeIndex+1<swipeCandidates().size){swipeIndex++;renderSwipe()}else toast(t("onlyCar"));return true}
                KeyEvent.KEYCODE_DPAD_DOWN->{toast(t("noSimilar"));return true}
                KeyEvent.KEYCODE_DPAD_UP,KeyEvent.KEYCODE_DPAD_RIGHT->{activePreviewCar=swipeCandidates().getOrNull(swipeIndex);openDetails("swipe");return true}
            }
        }
        return super.onKeyDown(keyCode,event)
    }
}
