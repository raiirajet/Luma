package ch.luma.auto

import android.app.Activity
import android.app.AlertDialog
import android.content.Intent
import android.graphics.BitmapFactory
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.net.Uri
import android.os.Bundle
import android.os.Build
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
import java.text.Normalizer
import java.text.NumberFormat
import java.time.LocalDate
import java.time.format.DateTimeFormatter
import java.time.format.FormatStyle
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
 * Limba Auto uses native Android Views and keeps the demo listings in local storage.
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
    private val importCountries by lazy { countries + Triple("CH", "🇨🇭", "Schweiz") }
    private val importCountryCodes by lazy { importCountries.map { it.first }.toSet() }
    private val packagedImportCatalog by lazy {
        runCatching {
            val data = assets.open("official-import-data.json").bufferedReader().use { it.readText() }
            OfficialImportCatalog.parse(data, importCountryCodes)
        }.getOrNull()
    }
    @Volatile private var updatedImportCatalog: OfficialImportCatalog? = null

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
        Thread({
            runCatching { OfficialImportCatalog.download(importCountryCodes) }.getOrNull()?.let { catalog ->
                val packagedDate = packagedImportCatalog?.verifiedOn
                if (packagedDate == null || !catalog.verifiedOn.isBefore(packagedDate)) updatedImportCatalog = catalog
            }
        }, "limba-official-import").start()
        locale = prefs.getString("language", "de") ?: "de"
        if (locale !in codes) locale = "de"
        starred = prefs.getBoolean("favorite", false)
        swipeSeen = prefs.getBoolean("swipeSeen", false)
        activeCountry = (prefs.getStringSet("countries", emptySet()) ?: emptySet()).toMutableSet()
        previewUser = prefs.getString("previewUser", "") ?: ""
        val stored = runCatching { JSONArray(prefs.getString("previewCars", "[]")) }.getOrDefault(JSONArray())
        for (i in 0 until stored.length()) stored.optJSONObject(i)?.let { previewCars.add(it) }
        previewStars = (prefs.getStringSet("previewStars", emptySet()) ?: emptySet()).toMutableSet()
        try { assets.open("gtr.jpg").use { carPhoto = BitmapFactory.decodeStream(it) } } catch (_: Exception) { }
        backend = LimbaFirebase(this)
        if (backend.ready) {
            backend.watchAuth { user ->
                if (cloudUser?.uid != user?.uid) {
                    openingSellerChat = false
                    conversationDialog?.dismiss()
                    countryRegistration?.remove()
                    countryRegistration = null
                    activeCountry = (prefs.getStringSet(
                        if (user == null) "countries" else "countries:" + user.uid,
                        emptySet()
                    ) ?: emptySet()).toMutableSet()
                }
                cloudUser = user
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
                cloudCars.clear();cloudCars.addAll(cars);render()
            }, { error -> toast(error) })
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
    private fun euro(n: Int) = NumberFormat.getNumberInstance(Locale.GERMANY).format(n) + " €"
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
            Triple("favorites", R.drawable.limba_favorites, t("garage")),
            Triple("performance", R.drawable.limba_car, t("performance"))
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
            cell.setOnClickListener { navigate(route) }
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
    private data class ImportVehicle(val title: String, val price: Double?, val country: String)

    private fun showBorderlessCalculator(car: JSONObject?) = showImportCalculator(
        listOf(
            if (car == null) ImportVehicle("", 68900.0, "HR")
            else ImportVehicle("", car.optDouble("price").takeIf(Double::isFinite), car.optString("country"))
        )
    )

    private fun importCountryName(code: String): String {
        val (_, flag, fallback) = importCountries.firstOrNull { it.first == code } ?: return code
        val name = if (code == "XK" || code == "TR") fallback
            else Locale("", code).getDisplayCountry(Locale.forLanguageTag(locale))
        return "$flag ${name.ifBlank { fallback }}"
    }

    private fun importDestinationPicker(layout: LinearLayout, selected: String): Spinner {
        layout.addView(label(t("targetCountry")))
        val spinner = Spinner(this).apply {
            background = c(paper, 11, border)
            contentDescription = t("targetCountry")
            adapter = ArrayAdapter(this@MainActivity, android.R.layout.simple_spinner_dropdown_item,
                listOf("—") + importCountries.map { importCountryName(it.first) })
            setSelection((importCountries.indexOfFirst { it.first == selected } + 1).coerceAtLeast(0))
        }
        layout.addView(spinner, lp(-1, 48))
        return spinner
    }

    private fun importDestinationCode(spinner: Spinner): String =
        importCountries.getOrNull(spinner.selectedItemPosition - 1)?.first.orEmpty()

    private fun showImportCalculator(vehicles: List<ImportVehicle>, selected: String = "") {
        val catalog = updatedImportCatalog ?: packagedImportCatalog
        if (catalog == null) showManualImportCalculator(vehicles, selected, false)
        else showOfficialImportCalculator(vehicles, catalog, selected)
    }

    private fun showManualImportCalculator(vehicles: List<ImportVehicle>, selected: String, canSwitch: Boolean) {
        val layout = col().apply { pad(this, 16, 8) }
        layout.addView(text(t("importDesc"), 13f, muted))
        val destination = importDestinationPicker(layout, selected)
        val currency = NumberFormat.getCurrencyInstance(Locale.forLanguageTag(locale)).apply {
            this.currency = java.util.Currency.getInstance("EUR")
        }
        val breakdownLabels = listOf("listedPrice", "transport", "customs", "vat", "registration", "total")
        val compare = vehicles.size == 2
        val calculations = vehicles.map { (title, price) ->
            if (title.isNotBlank()) {
                layout.addView(space(12))
                layout.addView(text(title, 16f, ink, true))
            }
            val fields = listOf("transport" to "€", "customs" to "%", "vat" to "%", "registration" to "€").map { (key, unit) ->
                editField(layout, t(key), "", unit).apply {
                    inputType = InputType.TYPE_CLASS_NUMBER or InputType.TYPE_NUMBER_FLAG_DECIMAL
                }
            }
            val result = text(t("estimateMissing"), 14f, ink, true).apply { setPadding(0, px(10), 0, px(10)) }
            layout.addView(result)
            Triple(price?.coerceAtLeast(0.0) ?: 0.0, fields, result)
        }
        val comparison = col()
        if (compare) layout.addView(comparison)
        layout.addView(text(t("estimateOnly"), 12f, muted))
        val builder = AlertDialog.Builder(this).setTitle(t(if (vehicles.size == 2) "compareImport" else "borderless"))
            .setView(ScrollView(this).apply { addView(layout) })
            .setPositiveButton(t("calculate"), null).setNegativeButton(t("cancel"), null)
        if (canSwitch) builder.setNeutralButton(t("officialMode")) { _, _ ->
            showImportCalculator(vehicles, importDestinationCode(destination))
        }
        val dialog = builder.create()
        dialog.setOnShowListener {
            dialog.getButton(AlertDialog.BUTTON_POSITIVE).setOnClickListener {
                comparison.removeAllViews()
                val breakdowns = mutableListOf<List<Double>>()
                for ((price, fields, result) in calculations) {
                    val raw = fields.map { it.text.toString().trim().replace(',', '.') }
                    val values = raw.map { value ->
                        if (value.isEmpty()) 0.0 else value.toDoubleOrNull()?.takeIf { it.isFinite() && it in 0.0..1000000.0 }
                    }
                    if (destination.selectedItemPosition == 0 || raw.all { it.isBlank() } || values.any { it == null } ||
                        (values[1] ?: 0.0) > 100.0 || (values[2] ?: 0.0) > 100.0) {
                        result.text = t("estimateMissing")
                        result.visibility = View.VISIBLE
                        continue
                    }
                    val (shipping, dutyRate, taxRate, registration) = values.filterNotNull()
                    val duty = (price + shipping) * dutyRate / 100.0
                    val vat = (price + shipping + duty) * taxRate / 100.0
                    val breakdown = listOf(price, shipping, duty, vat, registration, price + shipping + duty + vat + registration)
                    if (compare) {
                        breakdowns.add(breakdown)
                        result.visibility = View.GONE
                    } else {
                        result.text = breakdownLabels.zip(breakdown).joinToString("\n") { (key, value) ->
                            "${t(key)} · ${currency.format(value)}"
                        }
                    }
                }
                if (breakdowns.size == 2) {
                    comparison.addView(space(12))
                    val headers = row(navy).apply { pad(this, 7, 8) }
                    headers.addView(space(1), LinearLayout.LayoutParams(0, 1, 1f))
                    vehicles.forEach { (title, _) ->
                        headers.addView(text(title, 11f, paper, true), LinearLayout.LayoutParams(0, -2, 1f))
                    }
                    comparison.addView(headers)
                    breakdownLabels.forEachIndexed { index, key ->
                        val line = row(if (index % 2 == 0) paper else mist).apply { pad(this, 7, 8) }
                        val total = key == "total"
                        line.addView(text(t(key), 11f, muted, true), LinearLayout.LayoutParams(0, -2, 1f))
                        breakdowns.forEach { values ->
                            line.addView(text(currency.format(values[index]), 11f, ink, total), LinearLayout.LayoutParams(0, -2, 1f))
                        }
                        comparison.addView(line)
                    }
                }
            }
        }
        dialog.show()
    }
    private data class ImportAmountField(val group: LinearLayout, val input: EditText)

    private data class OfficialVehicleForm(
        val fields: Map<String, ImportAmountField>,
        val vat: Spinner,
        val circulation: CheckBox,
        val useCustomsRate: CheckBox
    )

    private fun importAmountField(parent: LinearLayout, key: String, value: String = ""): ImportAmountField {
        val group = col()
        val amount = input(value, "€").apply {
            id = View.generateViewId()
            inputType = InputType.TYPE_CLASS_NUMBER or InputType.TYPE_NUMBER_FLAG_DECIMAL
        }
        group.addView(label(t(key)).apply { labelFor = amount.id })
        group.addView(amount, lp(-1, 48))
        parent.addView(group)
        return ImportAmountField(group, amount)
    }

    private fun createOfficialVehicleForm(parent: LinearLayout, vehicle: ImportVehicle): OfficialVehicleForm {
        if (vehicle.title.isNotBlank()) {
            parent.addView(space(16))
            parent.addView(text(vehicle.title, 16f, ink, true))
        }
        if (vehicle.country.isNotBlank()) {
            parent.addView(text("${t("officialLocation")} · ${importCountryName(vehicle.country)}", 13f, muted))
        }
        val fields = mutableMapOf(
            "price" to importAmountField(parent, "listedPrice", vehicle.price?.let {
                java.math.BigDecimal.valueOf(it).stripTrailingZeros().toPlainString()
            }.orEmpty()),
            "transport" to importAmountField(parent, "transport")
        )
        val circulation = CheckBox(this).apply {
            text = t("officialEuCirculation")
            setTextColor(ink)
        }
        parent.addView(circulation, lp(-1, -2))
        fields["customs"] = importAmountField(parent, "officialCustomsAmount")
        val useCustomsRate = CheckBox(this).apply {
            text = t("officialUseCustomsRate")
            setTextColor(ink)
        }
        parent.addView(useCustomsRate, lp(-1, -2))
        fields["customsBasis"] = importAmountField(parent, "officialCustomsBasis")

        val vat = Spinner(this).apply {
            id = View.generateViewId()
            background = c(paper, 11, border)
            contentDescription = t("officialVatApplies")
            adapter = ArrayAdapter(this@MainActivity, android.R.layout.simple_spinner_dropdown_item,
                listOf(t("officialUnknown"), t("officialYes"), t("officialNo")))
        }
        parent.addView(label(t("officialVatApplies")).apply { labelFor = vat.id })
        parent.addView(vat, lp(-1, 48))
        fields["vatBasis"] = importAmountField(parent, "officialVatBasis")
        fields["vehicleTaxBasis"] = importAmountField(parent, "officialVehicleTaxBasis")
        fields["otherCharges"] = importAmountField(parent, "officialOtherCharges")
        fields["registration"] = importAmountField(parent, "registration")
        return OfficialVehicleForm(fields, vat, circulation, useCustomsRate)
    }

    private fun updateOfficialForm(form: OfficialVehicleForm, destination: OfficialImportDestination?) {
        val dutyApplies = destination != null && !destination.hasNoCustoms(form.circulation.isChecked)
        val hasRate = dutyApplies && destination?.customsStandardRate != null
        form.circulation.visibility = if (destination?.isEu == true) View.VISIBLE else View.GONE
        form.useCustomsRate.visibility = if (hasRate) View.VISIBLE else View.GONE
        form.fields.getValue("customs").group.visibility = if (dutyApplies) View.VISIBLE else View.GONE
        form.fields.getValue("customsBasis").group.visibility =
            if (hasRate && form.useCustomsRate.isChecked) View.VISIBLE else View.GONE
        form.fields.getValue("vatBasis").group.visibility = if (form.vat.selectedItemPosition == 1) View.VISIBLE else View.GONE
        form.fields.getValue("vehicleTaxBasis").group.visibility =
            if (destination?.vehicleTaxRate != null) View.VISIBLE else View.GONE
    }

    private fun readOfficialForm(form: OfficialVehicleForm): OfficialImportInput? {
        var invalid = false
        fun amount(key: String): Double? {
            val field = form.fields.getValue(key)
            if (field.group.visibility != View.VISIBLE) return null
            val raw = field.input.text.toString().trim().replace(',', '.')
            if (raw.isBlank()) return null
            val value = raw.toDoubleOrNull()?.takeIf { it.isFinite() && it in 0.0..999999999.99 }
            if (value == null) {
                field.input.error = t("officialInvalid")
                invalid = true
            }
            return value
        }
        val input = OfficialImportInput(
            price = amount("price"),
            transport = amount("transport"),
            customs = amount("customs"),
            customsBasis = amount("customsBasis"),
            useCustomsRate = form.useCustomsRate.visibility == View.VISIBLE && form.useCustomsRate.isChecked,
            vatBasis = amount("vatBasis"),
            vehicleTaxBasis = amount("vehicleTaxBasis"),
            otherCharges = amount("otherCharges"),
            registration = amount("registration"),
            vatApplicable = when (form.vat.selectedItemPosition) { 1 -> true; 2 -> false; else -> null },
            euCirculation = form.circulation.visibility == View.VISIBLE && form.circulation.isChecked
        )
        return input.takeUnless { invalid }
    }

    private fun showOfficialSources(panel: LinearLayout, destination: OfficialImportDestination, checked: LocalDate) {
        val language = Locale.forLanguageTag(locale)
        val num = NumberFormat.getNumberInstance(language)
        val verifiedDate = checked.format(DateTimeFormatter.ofLocalizedDate(FormatStyle.MEDIUM).withLocale(language))
        panel.addView(text("${t("officialVerifiedOn")} · $verifiedDate", 12f, muted))
        panel.addView(text("${t("officialVatRate")} · ${num.format(destination.vatRate)} %", 15f, ink, true))
        val customsRate = if (destination.customsZero) 0.0 else destination.customsStandardRate
        customsRate?.let {
            panel.addView(text("${t("officialCustomsRate")} · ${num.format(it)} %", 13f, ink, true))
        }
        destination.vehicleTaxRate?.let {
            panel.addView(text("${t("officialVehicleTax")} · ${num.format(it)} %", 13f, ink, true))
        }
        panel.addView(text("${t("officialCurrencyHelp")} · ${destination.currency}", 12f, muted))
        val sources = listOf(
            "officialVatSource" to destination.vatSource,
            "officialCustomsSource" to destination.customsSource,
            "officialVehicleTaxSource" to destination.vehicleTaxSource,
            "officialExtraSource" to destination.extraSource,
            "officialFxSource" to destination.fxSource
        )
        sources.forEach { (label, url) ->
            if (url != null) {
                panel.addView(btn(t(label), false) {
                    runCatching { startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url))) }
                        .onFailure { toast(t("officialUnavailable")) }
                })
                panel.addView(space(4))
            }
        }
    }

    private fun renderOfficialImportResult(
        panel: LinearLayout,
        vehicles: List<ImportVehicle>,
        estimates: List<OfficialImportEstimate>
    ) {
        val currency = NumberFormat.getCurrencyInstance(Locale.forLanguageTag(locale)).apply {
            this.currency = java.util.Currency.getInstance("EUR")
        }
        if (vehicles.size == 2) {
            val header = row(navy).apply { pad(this, 7, 8) }
            header.addView(space(1), LinearLayout.LayoutParams(0, 1, 1f))
            vehicles.forEach { vehicle ->
                header.addView(text(vehicle.title, 11f, paper, true), LinearLayout.LayoutParams(0, -2, 1f))
            }
            panel.addView(header)
        }
        fun addRow(key: String, index: Int, values: List<Double?>, strong: Boolean = false) {
            val line = row(if (index % 2 == 0) paper else mist).apply { pad(this, 7, 8) }
            line.addView(text(t(key), 12f, muted, true), LinearLayout.LayoutParams(0, -2, 1f))
            values.forEach { value ->
                val caption = value?.let(currency::format) ?: t("officialUnknown")
                line.addView(text(caption, 12f, ink, strong), LinearLayout.LayoutParams(0, -2, 1f))
            }
            panel.addView(line)
        }
        val keys = estimates.first().amounts.keys
        keys.forEachIndexed { index, key -> addRow(key, index, estimates.map { it.amounts[key] }) }
        val complete = estimates.all { it.complete }
        addRow(if (complete) "total" else "officialSubtotal", keys.size, estimates.map { it.subtotal }, true)
        if (!complete) panel.addView(text(t("officialNeedsInput"), 12f, muted))
    }

    private fun showOfficialImportCalculator(
        vehicles: List<ImportVehicle>,
        catalog: OfficialImportCatalog,
        selected: String
    ) {
        val layout = col().apply { pad(this, 16, 8) }
        layout.addView(text(t("officialMode"), 15f, ink, true))
        layout.addView(text(t("officialStandardScope"), 13f, muted))
        val destination = importDestinationPicker(layout, selected)
        val sourcePanel = col()
        layout.addView(sourcePanel)
        val formsPanel = col()
        layout.addView(formsPanel)
        formsPanel.addView(text(t("officialBasisHelp"), 13f, muted))
        val forms = vehicles.map { createOfficialVehicleForm(formsPanel, it) }
        val result = col()
        layout.addView(result)
        layout.addView(text(t("estimateOnly"), 12f, muted))

        fun rateRecord(): OfficialImportDestination? = catalog.destinations[importDestinationCode(destination)]
        fun prepareForms() {
            val record = rateRecord()
            formsPanel.visibility = if (record != null) View.VISIBLE else View.GONE
            sourcePanel.removeAllViews()
            result.removeAllViews()
            if (record != null) showOfficialSources(sourcePanel, record, catalog.verifiedOn)
            forms.forEach { form -> updateOfficialForm(form, record) }
        }
        destination.onItemSelectedListener = object : AdapterView.OnItemSelectedListener {
            private var lastSelection = destination.selectedItemPosition
            override fun onNothingSelected(parent: AdapterView<*>?) {}
            override fun onItemSelected(parent: AdapterView<*>?, view: View?, position: Int, id: Long) {
                if (position != lastSelection) {
                    forms.forEach { form ->
                        form.circulation.isChecked = false
                        form.useCustomsRate.isChecked = false
                        form.vat.setSelection(0)
                        form.fields.filterKeys { it != "price" }.values.forEach { it.input.text.clear() }
                    }
                    lastSelection = position
                }
                prepareForms()
            }
        }
        forms.forEach { form ->
            fun changed() {
                result.removeAllViews()
                updateOfficialForm(form, rateRecord())
            }
            form.circulation.setOnCheckedChangeListener { _, _ -> changed() }
            form.useCustomsRate.setOnCheckedChangeListener { _, _ -> changed() }
            form.fields.values.forEach { field ->
                field.input.addTextChangedListener(object : TextWatcher {
                    override fun beforeTextChanged(s: CharSequence?, start: Int, count: Int, after: Int) {}
                    override fun onTextChanged(s: CharSequence?, start: Int, before: Int, count: Int) {}
                    override fun afterTextChanged(s: Editable?) { result.removeAllViews() }
                })
            }
            form.vat.onItemSelectedListener = object : AdapterView.OnItemSelectedListener {
                override fun onNothingSelected(parent: AdapterView<*>?) {}
                override fun onItemSelected(parent: AdapterView<*>?, view: View?, position: Int, id: Long) = changed()
            }
        }
        prepareForms()
        val dialog = AlertDialog.Builder(this).setTitle(t(if (vehicles.size == 2) "compareImport" else "borderless"))
            .setView(ScrollView(this).apply { addView(layout) })
            .setPositiveButton(t("calculate"), null)
            .setNegativeButton(t("cancel"), null)
            .setNeutralButton(t("manualMode")) { _, _ ->
                showManualImportCalculator(vehicles, importDestinationCode(destination), true)
            }.create()
        dialog.setOnShowListener {
            dialog.getButton(AlertDialog.BUTTON_POSITIVE).setOnClickListener {
                result.removeAllViews()
                val record = rateRecord()
                if (record == null) {
                    result.addView(text(t("estimateMissing"), 13f, muted))
                    return@setOnClickListener
                }
                val inputs = forms.map(::readOfficialForm)
                if (inputs.any { it == null }) return@setOnClickListener
                val estimates = inputs.filterNotNull().map { estimateOfficialImport(record, it) }
                renderOfficialImportResult(result, vehicles, estimates)
                result.post { result.requestRectangleOnScreen(android.graphics.Rect(0, 0, result.width, result.height), false) }
            }
        }
        dialog.show()
    }

    private fun renderPerformance() {
        val main=container();toolbar(main,t("performance"),{navigate("home")})
        val content=col().apply{setPadding(px(17),px(22),px(17),px(22))}
        content.addView(text("LIMBA PERFORMANCE",22f,ink,true))
        content.addView(space(6));content.addView(text(t("performanceDesc"),13f,muted));content.addView(space(16))
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
        form.addView(label(t("priceTo")))
        form.addView(priceField, lp(-1,48))
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
        spotlight.addView(text(t("showroom"),13f,0xff8dccff.toInt(),true))
        spotlight.addView(space(9))
        val featured=cloudCars.firstOrNull{matchesCar(it)} ?: previewCars.firstOrNull{matchesPreview(it)}
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
            results.addView(text(total.toString()+" "+t("searchResultCount"),12f,orange,true))
            showFilterChips(results)
            results.addView(space(13))
            available.forEach{results.addView(previewCard(it));results.addView(space(12))}
            preview.forEach{results.addView(previewCard(it));results.addView(space(12))}
            if(demo){results.addView(carCard());results.addView(space(12))}
            if(total==0)emptyState(results,t("emptyCars"))
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
        val view = col(paper).apply { background = c(paper, 16, border); clipToOutline = true }
        view.addView(listingImage(car.optString("image").takeIf { live }, vehicleDisplayName(car), 188).apply {
            isFocusable = true
            setOnClickListener { open() }
        }, lp(-1, 188))
        val content = col().apply { pad(this, 15, 12) }
        val priceRow = row()
        priceRow.addView(text(euro(car.optInt("price")), 24f, ink, true), LinearLayout.LayoutParams(0, -2, 1f))
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
        content.addView(text(vehicleDisplayName(car), 19f, ink, true))
        content.addView(space(5))
        content.addView(text("${car.optInt("year")} · ${number(car.optInt("mileage"))} km · ${car.optInt("power")} PS", 13f, muted))
        val location = "${car.optString("city")} · ${car.optString("country")}"
        val seller = if (live) t(car.optString("sellerType", "privateSeller")) else t("previewOnly")
        content.addView(text("$location · $seller", 13f, muted))
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
            .setPositiveButton(t("compareImport")) { _, _ ->
                showImportCalculator(pair.map { ImportVehicle(vehicleDisplayName(it),
                    it.optDouble("price").takeIf(Double::isFinite), it.optString("country")) })
            }
            .setNegativeButton(t("cancel"), null).show()
    }
    private fun renderFavorites() {
        val main=container();toolbar(main,t("garage"))
        val content=col().apply{setPadding(px(17),px(20),px(17),px(20))}
        content.addView(text(t("garage"),23f,ink,true))
        content.addView(space(7));content.addView(text(t("garageDesc"),13f,muted));content.addView(space(16))
        val cars=mutableListOf<JSONObject>()
        cars.addAll(cloudCars.filter{it.optString("id") in cloudStars})
        cars.addAll(previewCars.filter{it.optString("id") in previewStars && matchesPreview(it)})
        if(starred)cars.add(JSONObject().put("id","demo-nissan-gtr")
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
        val countryHeader = row()
        countryHeader.addView(drawableIcon(R.drawable.limba_map, orange, 28), lp(28,28))
        countryHeader.addView(spaceHorizontal(9))
        countryHeader.addView(text(t("searchCountries"),20f,ink,true))
        content.addView(countryHeader);content.addView(space(7))
        content.addView(text(t("searchCountriesDesc"),13f,muted));content.addView(space(14))
        countries.forEach { (code,flag,name) ->
            val box=CheckBox(this).apply { text="$flag  $name";isChecked=code in activeCountry;setTextColor(ink);textSize=15f;buttonTintList=android.content.res.ColorStateList.valueOf(orange)
                setPadding(px(10),px(4),px(10),px(4));background=c(paper,10) }
            box.setOnCheckedChangeListener { _,isChecked -> if(isChecked)activeCountry.add(code) else activeCountry.remove(code) }
            content.addView(box,lp(-1,46));content.addView(space(4))
        }
        content.addView(space(9))
        content.addView(btn(t("saveSettings"),true) {
            persistSearchCountries();goBack()
        });content.addView(space(19))
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
            empty.addView(text(t("emptyCars"),20f,paper,true))
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
        val buttons=row()
        buttons.addView(iconText(R.drawable.limba_info,t("swipeDetails"),{details()}),LinearLayout.LayoutParams(0,px(50),1f))
        buttons.addView(spaceHorizontal(10))
        val liked=if(current==null)starred else if(live)current.optString("id") in cloudStars else current.optString("id") in previewStars
        buttons.addView(iconButton(R.drawable.limba_favorites,t("saveFavourites"),if(liked)orange else ink){
            if(current==null)setFavorite(!starred)else {
                val id=current.optString("id")
                if(live){
                    if(cloudUser==null)showAccount()
                    else backend.toggleFavorite(id,id !in cloudStars){err->if(err!=null)toast(err)}
                }else{
                    if(id in previewStars)previewStars.remove(id)else previewStars.add(id)
                    prefs.edit().putStringSet("previewStars",previewStars.toSet()).apply()
                }
            };renderSwipe()
        },lp(56,52))
        overlay.addView(buttons)
        full.addView(overlay,fp(-1,-2,Gravity.BOTTOM))
        if(!swipeSeen)root.post {if(screen=="swipe"&&!swipeSeen)showSwipeTutorial()}
    }
    private fun showSwipeTutorial() {
        val tutorial=col().apply {setPadding(px(20),px(10),px(20),px(10))}
        val intro = row()
        intro.addView(drawableIcon(R.drawable.limba_info, orange, 30), lp(30,30))
        intro.addView(spaceHorizontal(10))
        intro.addView(text(t("swipeTeach"), 14f, ink, true))
        tutorial.addView(intro);tutorial.addView(space(8))
        val items=listOf(
            Triple(R.drawable.limba_back,"swipeNext","swipeNextSub"),
            Triple(R.drawable.ic_arrow_right,"swipeOpen","swipeOpenSub"),
            Triple(R.drawable.ic_arrow_up,"swipeDetails","swipeDetailsSub"),
            Triple(R.drawable.ic_arrow_down,"swipeSimilar","swipeSimilarSub")
        )
        items.forEach { (glyph,title,detail) ->
            val line=row()
            line.addView(drawableIcon(glyph,orange,26),lp(28,28))
            line.addView(spaceHorizontal(14))
            line.addView(text(t(title)+" · "+t(detail),13f,ink,true))
            tutorial.addView(line,lp(-1,58))
        }
        AlertDialog.Builder(this).setTitle(t("swipeTeach"))
            .setView(tutorial)
            .setPositiveButton(t("swipeStart")) { _,_-> swipeSeen=true;prefs.edit().putBoolean("swipeSeen",true).apply() }
            .setNegativeButton(t("backToCar")) { _,_->swipeSeen=true;prefs.edit().putBoolean("swipeSeen",true).apply() }
            .show()
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
        content.addView(space(12))
        content.addView(btn(t("borderless"),false){showBorderlessCalculator(car)})
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
        content.addView(btn(t("backToListing"),true){activePreviewCar=null;navigate(backFromDetail)})
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
        info.addView(space(12));info.addView(btn(t("borderless"),false){showBorderlessCalculator(null)})
        info.addView(space(15))
        info.addView(btn(t("photoCredit")+" Joshua Spence · CC BY-SA 4.0",false) {
            startActivity(Intent(Intent.ACTION_VIEW,Uri.parse("https://commons.wikimedia.org/wiki/File:Nissan_GT-R_R35_Black_Edition.JPG")))
        })
        info.addView(space(10))
        info.addView(btn(if(backFromDetail=="swipe")t("backToSwipe")else t("backToListing"),true){navigate(backFromDetail)})
        content.addView(info);body(main,content)
    }
    private fun shareWebsite() {
        val i=Intent(Intent.ACTION_SEND).apply {type="text/plain";putExtra(Intent.EXTRA_TEXT,"Limba Auto · https://raiirajet.github.io/Luma/")}
        startActivity(Intent.createChooser(i,t("shareCar")))
    }
    private fun hashPassword(password: String, salt: String): String {
        val key=PBEKeySpec(password.toCharArray(),salt.toByteArray(Charsets.UTF_8),120000,256)
        val raw=SecretKeyFactory.getInstance("PBKDF2WithHmacSHA256").generateSecret(key).encoded
        return raw.joinToString("") { "%02x".format(it.toInt() and 255) }
    }
    private fun showAccount() {
        if(previewUser.isBlank() && backend.ready){ showFirebaseAccount(); return }
        if(previewUser.isNotBlank()) {
            AlertDialog.Builder(this).setTitle(t("accountLogin")+" · "+previewUser)
                .setMessage(t("previewMode")+"\n"+t("previewNotSynced"))
                .setPositiveButton(t("signOut")){_,_->previewUser="";prefs.edit().remove("previewUser").apply();render()}
                .setNegativeButton(t("cancelPreview"),null).show()
            return
        }
        val body=col().apply {setPadding(px(15),px(10),px(15),px(6))}
        body.addView(text(t("demoAccess"),14f,navy,true))
        val username=editField(body,t("usernameOrEmail"),"","limba")
        val password=editField(body,t("password"),"","demo")
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
                    var valid=name=="limba"&&pass=="demo"
                    if(!valid){val acc=JSONObject(prefs.getString("previewAccounts","{}")?:"{}").optJSONObject(name)
                        if(acc!=null){val calculated=hashPassword(pass,acc.optString("salt"));valid=MessageDigest.isEqual(calculated.toByteArray(),acc.optString("hash").toByteArray())}}
                    if(!valid)toast(t("loginInvalid")) else {
                        previewUser=name;prefs.edit().putString("previewUser",name).apply();dlg.dismiss();render();toast(t("welcomePreview"))
                    }
                } }
                dlg.show()
            }
    }

    private fun showFirebaseAccount() {
        val user = cloudUser
        if(user != null) {
            val choices = arrayOf(t("myAds"), t("messages"), t("notifications"), t("refreshVerification"), t("sendVerification"), t("signOut"))
            AlertDialog.Builder(this).setTitle(user.email ?: "Limba")
                .setMessage(if(user.isEmailVerified)t("verifiedBadge") else t("notVerified"))
                .setItems(choices) { _,which ->
                    when(which) {
                        0 -> navigate("mine")
                        1 -> navigate("messages")
                        2 -> navigate("notifications")
                        3 -> backend.refreshVerification { confirmed ->
                            toast(if(confirmed)t("verifiedBadge")else t("notVerified"));render()
                        }
                        4 -> backend.sendVerification { err -> toast(err ?: t("checkEmail")) }
                        5 -> backend.auth?.signOut()
                    }
                }.setNegativeButton(t("cancel"),null).show()
            return
        }
        AlertDialog.Builder(this).setTitle(t("accountLogin"))
            .setItems(arrayOf(t("login"),t("register"),t("forgotPassword"),t("signInDemo"))) { _,which ->
                when(which){
                    0->showFirebaseAuthForm("login")
                    1->showFirebaseAuthForm("register")
                    2->showFirebaseAuthForm("reset")
                    3->{previewUser="limba";prefs.edit().putString("previewUser",previewUser).apply()
                        render();toast(t("welcomePreview"))}
                }
            }.setNegativeButton(t("cancel"),null).show()
    }
    private fun showFirebaseAuthForm(mode:String) {
        val layout=col().apply { setPadding(px(16),px(8),px(16),px(8)) }
        val email=editField(layout,t("email"),"","name@example.com")
        email.inputType=InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_EMAIL_ADDRESS
        val password=if(mode!="reset")editField(layout,t("password"),"","")else null
        password?.inputType=InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_PASSWORD
        val confirm=if(mode=="register")editField(layout,t("confirmPassword"),"","")else null
        confirm?.inputType=InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_PASSWORD
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
                        if(mode!="reset" && pass.length<8) {
                            toast(t("minPassword"));return@setOnClickListener
                        }
                        if(mode=="register" && pass != confirm?.text.toString()) {
                            toast(t("passwordsMismatch"));return@setOnClickListener
                        }
                        positive.isEnabled=false
                        val done:(String?)->Unit={ error ->
                            positive.isEnabled=true
                            if(error!=null)toast(error)else{
                                dialog.dismiss();toast(if(mode=="register"||mode=="reset")t("checkEmail") else t("login"))
                            }
                        }
                        when(mode){
                            "register"->backend.register(address,pass,done)
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
        val sellerTypes=listOf("privateSeller","dealer")
        val seller=spinner(t("sellerType"),sellerTypes.map { it to t(it) })
        existing?.let {seller.setSelection(sellerTypes.indexOf(it.optString("sellerType")).coerceAtLeast(0))}
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
            pickedImages.clear()
            col.addView(space(12))
            col.addView(text(t("photoGuide"), 13f, muted))
            col.addView(btn(t("listingPhotos"),false){
                val intent=Intent(Intent.ACTION_OPEN_DOCUMENT).apply{
                    type="image/*";addCategory(Intent.CATEGORY_OPENABLE)
                    putExtra(Intent.EXTRA_ALLOW_MULTIPLE,true)
                }
                startActivityForResult(intent,pickPhotosRequest)
            })
            pickedImagesLabel=text("0 / 6",12f,muted)
            col.addView(pickedImagesLabel)
            renderPickedPhotoFields = { showPhotoFields(pickedImages.mapIndexed { index, uri -> index to uri.toString() }, null) }
        } else if (!isPreview && existing != null) {
            showPhotoFields(listingPhotos(existing), existing.optJSONObject("photoDetails"))
        }
        col.addView(photoControls)
        val scroll=ScrollView(this);scroll.addView(col)
        AlertDialog.Builder(this).setTitle(t("vehicleProfile")).setView(scroll)
            .setPositiveButton(if(isPreview)t("savePreviewCar")else if(existing!=null)t("editAd")else t("publish"),null)
            .setNegativeButton(t("cancelPreview"),null)
            .create().also{dlg->
                dlg.setOnDismissListener { renderPickedPhotoFields = null; pickedImagesLabel = null }
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
                        submit.isEnabled=false
                        val done:(String?)->Unit={error->
                            submit.isEnabled=true
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
            .setMessage(t("authUnavailable")+"\n\n"+t("demoOnly"))
            .setPositiveButton("OK",null).show()
    }
    override fun onDestroy() {
        conversationDialog?.dismiss()
        screenRegistration?.remove()
        searchRegistrations.forEach { it.remove() }
        countryRegistration?.remove()
        if (::backend.isInitialized) backend.close()
        super.onDestroy()
    }

    @Deprecated("Activity result API retained for compatibility with Activity base class")
    override fun onActivityResult(requestCode:Int,resultCode:Int,data:Intent?) {
        super.onActivityResult(requestCode,resultCode,data)
        if(requestCode!=pickPhotosRequest || resultCode!=RESULT_OK || data==null)return
        pickedImages.clear()
        data.clipData?.let { clip ->
            for(i in 0 until minOf(clip.itemCount,6))pickedImages.add(clip.getItemAt(i).uri)
        } ?: data.data?.let { pickedImages.add(it) }
        pickedImagesLabel?.text = "${pickedImages.size} / 6"
        renderPickedPhotoFields?.invoke()
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
