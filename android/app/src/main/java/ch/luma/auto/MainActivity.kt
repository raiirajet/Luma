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
import android.widget.ArrayAdapter
import android.widget.AutoCompleteTextView
import android.widget.Button
import android.widget.CheckBox
import android.widget.EditText
import android.widget.FrameLayout
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.Spinner
import android.widget.TextView
import android.widget.Toast
import com.google.firebase.firestore.DocumentSnapshot
import com.google.firebase.firestore.ListenerRegistration
import org.json.JSONArray
import org.json.JSONObject
import java.text.NumberFormat
import java.util.Locale
import javax.crypto.SecretKeyFactory
import javax.crypto.spec.PBEKeySpec
import java.security.SecureRandom
import java.security.MessageDigest
import android.text.InputType

/**
 * Limba Auto — native Android proof-of-concept.
 * This Activity uses Android Views throughout: no WebView, website frame or remote UI.
 * It deliberately does not emulate a Firebase login: the production backend has
 * not been configured. Demo listing information is fictional and identified as such.
 */
class MainActivity : Activity() {
    private val ink = Color.rgb(16, 43, 58)
    private val navy = Color.rgb(12, 40, 56)
    private val orange = Color.rgb(20, 121, 237)
    private val paper = Color.WHITE
    private val mist = Color.rgb(243, 247, 248)
    private val muted = Color.rgb(100, 124, 137)
    private val border = Color.rgb(218, 230, 234)
    private lateinit var root: FrameLayout
    private lateinit var messages: JSONObject
    private lateinit var brands: JSONObject
    private val prefs by lazy { getSharedPreferences("luma_native_v1", MODE_PRIVATE) }
    private var locale = "de"
    private var screen = "home"
    private var backFromDetail = "home"
    private var starred = false
    private var swipeSeen = false
    private var activeCountry = mutableSetOf<String>()
    private var keyword = ""
    private var make = ""
    private var model = ""
    private var maxPrice = ""
    private var minPrice = ""
    private var yearFrom = ""
    private var yearTo = ""
    private var sellerType = ""
    private var maxMileage = ""
    private var fuel = ""
    private var transmission = ""
    private var body = ""
    private var saveCount = 0
    private var previewUser = ""
    private val previewCars = mutableListOf<JSONObject>()
    private val cloudCars = mutableListOf<JSONObject>()
    private val ownCars = mutableListOf<JSONObject>()
    private var cloudStars = mutableSetOf<String>()
    private var cloudUser: com.google.firebase.auth.FirebaseUser? = null
    private lateinit var backend: LimbaFirebase
    private lateinit var social: LimbaSocial
    private var activeConversation = ""
    private val socialListeners = mutableListOf<ListenerRegistration>()
    private val pickedImages = mutableListOf<Uri>()
    private var pickedImagesLabel: TextView? = null
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
        brands = JSONObject(assets.open("brands.json").bufferedReader().use { it.readText() })
        locale = prefs.getString("language", "de") ?: "de"
        if (locale !in codes) locale = "de"
        starred = prefs.getBoolean("favorite", false)
        swipeSeen = prefs.getBoolean("swipeSeen", false)
        activeCountry = (prefs.getStringSet("countries", emptySet()) ?: emptySet()).toMutableSet()
        previewUser = prefs.getString("previewUser", "") ?: ""
        val stored = runCatching { JSONArray(prefs.getString("previewCars", "[]")) }.getOrDefault(JSONArray())
        for (i in 0 until stored.length()) stored.optJSONObject(i)?.let { previewCars.add(it) }
        previewStars = (prefs.getStringSet("previewStars", emptySet()) ?: emptySet()).toMutableSet()
        saveCount = prefs.getString("searches", "[]")?.let { runCatching { JSONArray(it).length() }.getOrDefault(0) } ?: 0
        try { assets.open("gtr.jpg").use { carPhoto = BitmapFactory.decodeStream(it) } } catch (_: Exception) { }
        backend = LimbaFirebase(this)
        social = LimbaSocial(this)
        if (backend.ready) {
            backend.watchAuth { user ->
                cloudUser = user
                if(user != null && user.isEmailVerified && !user.phoneNumber.isNullOrBlank()) social.callable("syncPublicProfile",emptyMap()){_,_->}
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
        val local = messages.optJSONObject(locale)
        val value = local?.optString(k) ?: ""
        if (value.isNotBlank() && value != k) return value
        val de = messages.optJSONObject("de")?.optString(k) ?: ""
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
    private fun clearSocialSubscriptions() { socialListeners.forEach { it.remove() };socialListeners.clear() }
    private fun navigate(next: String) { clearSocialSubscriptions();screen = next; render() }
    private fun container(): LinearLayout {
        root.removeAllViews()
        root.setBackgroundColor(navy)
        val main = col()
        main.setBackgroundColor(mist)
        root.addView(main, fp())
        return main
    }

    private fun toolbar(main: LinearLayout, section: String, back: (() -> Unit)? = null) {
        val line = row(paper)
        line.setPadding(px(14), px(7), px(14), px(7))
        val left = iconButton(if (back != null) R.drawable.limba_back else R.drawable.ic_luma,
            if (back != null) t("backToMarket") else "Limba Auto", if (back != null) ink else orange,
            paper) { if (back != null) back() else navigate("home") }
        left.background = null
        line.addView(left, lp(48, 48))
        val headline = col()
        headline.addView(drawableIcon(R.drawable.limba_logo_wordmark, ink, 135), lp(135, 38))
        headline.addView(text(section, 10f, muted, true))
        line.addView(headline, LinearLayout.LayoutParams(0, -2, 1f))
        line.addView(iconButton(R.drawable.limba_profile,t("accountLogin")) { showAccount() },lp(48,48))
        if (section != t("settings")) {
            line.addView(iconButton(R.drawable.limba_settings, t("settings")) { navigate("settings") }, lp(48, 48))
        }
        main.addView(line, lp(-1, 65))
    }
    private fun navigation(main: LinearLayout) {
        val nav = row(paper).apply { gravity = Gravity.CENTER }
        val routes = listOf(
            Triple("home", R.drawable.limba_search, if(locale=="de")"Finden"else t("carsNav")),
            Triple("swipe", R.drawable.limba_vehicle_cards, t("swipe")),
            Triple("favorites", R.drawable.limba_favorites, t("saved")),
            Triple("sell", R.drawable.limba_add_car, if(locale=="de")"Verkaufen"else t("sellCar")),
            Triple("messages", R.drawable.limba_messages, t("socialMessages")),
            Triple("profile", R.drawable.limba_profile, t("socialProfile"))
        )
        routes.forEach { (route, icon, name) ->
            val selected = screen == route
            val cell = col().apply {
                gravity = Gravity.CENTER
                setPadding(px(1), px(6), px(1), px(6))
                isClickable = true; isFocusable = true; minimumHeight = px(64)
                contentDescription = name
                if (selected) background = c(mist, 11)
            }
            val glyph = drawableIcon(icon, if (selected) orange else muted, 21)
            val center = FrameLayout(this)
            center.addView(glyph, fp(23, 23, Gravity.CENTER))
            cell.addView(center, lp(-1, 26))
            cell.addView(text(name, 9f, if (selected) ink else muted, selected).apply {
                gravity = Gravity.CENTER; maxLines = 1
            })
            nav.addView(cell, LinearLayout.LayoutParams(0, px(66), 1f))
            cell.setOnClickListener { if(route=="sell")showCarForm() else navigate(route) }
        }
        main.addView(nav, lp(-1, 66))
    }
    private fun body(main: LinearLayout, content: LinearLayout) {
        val scroll = ScrollView(this).apply { isFillViewport = true; isVerticalScrollBarEnabled = false }
        scroll.addView(content)
        main.addView(scroll, LinearLayout.LayoutParams(-1, 0, 1f))
    }
    private fun render() {
        clearSocialSubscriptions()
        when (screen) {
            "messages" -> renderMessages()
            "chat" -> renderConversation()
            "profile" -> renderSocialProfile()
            "swipe" -> renderSwipe()
            "details" -> renderDetails()
            "favorites" -> renderFavorites()
            "settings" -> renderSettings()
            "searches" -> renderSavedSearches()
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
        if (make.isNotBlank() && !"nissan".contains(make.trim().lowercase())) return false
        if (model.isNotBlank() && !"gt-r".contains(model.trim().lowercase())) return false
        if (maxPrice.toIntOrNull()?.let { 68900 > it } == true) return false
        if (minPrice.toIntOrNull()?.let { 68900 < it } == true) return false
        if (yearFrom.toIntOrNull()?.let { 2013 < it } == true) return false
        if (yearTo.toIntOrNull()?.let { 2013 > it } == true) return false
        if (maxMileage.toIntOrNull()?.let { 49500 > it } == true) return false
        if (fuel.isNotBlank() && fuel != "petrol") return false
        if (transmission.isNotBlank() && transmission != "automatic") return false
        if (body.isNotBlank() && body != "coupe") return false
        if (sellerType.isNotBlank() && sellerType != "privateSeller") return false
        return true
    }

    private fun canonicalBrand(input: String): String {
        val target = input.trim()
        val makes = brands.optJSONArray("makes") ?: return target
        for (i in 0 until makes.length()) {
            val candidate = makes.optString(i)
            if (candidate.equals(target, ignoreCase = true)) return candidate
        }
        return target
    }
    private fun autoComplete(value: String, hint: String, suggestions: List<String>, callback: (String) -> Unit): AutoCompleteTextView {
        val field = AutoCompleteTextView(this).apply {
            setSingleLine(true); setTextSize(15f); setTextColor(ink); setHintTextColor(muted)
            setHint(hint); setText(value); threshold = 0
            setPadding(px(13), px(11), px(13), px(11))
            background = c(paper, 11, border)
            setAdapter(ArrayAdapter(this@MainActivity, android.R.layout.simple_dropdown_item_1line, suggestions))
            dropDownHeight = px(280)
            dropDownVerticalOffset = px(3)
            // On tap: show the complete offline list. Native filtering starts on typing.
            setOnClickListener { if ((adapter?.count ?: 0) > 0) showDropDown() }
            setOnFocusChangeListener { _, hasFocus ->
                if (hasFocus) post { if ((adapter?.count ?: 0) > 0) showDropDown() }
                else callback(text.toString().trim())
            }
            setOnItemClickListener { _, _, _, _ -> callback(text.toString().trim()) }
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

    private fun renderHome() {
        val main = container()
        toolbar(main, "AUTO · SÜDOSTEUROPA")
        val content = col()
        val hero = col(navy).apply { setPadding(px(22), px(29), px(22), px(28)) }
        val heroBrand = row()
        heroBrand.addView(drawableIcon(R.drawable.limba_car, orange, 18), lp(18, 18))
        heroBrand.addView(spaceHorizontal(9))
        heroBrand.addView(text("LIMBA AUTO", 12f, orange, true))
        hero.addView(heroBrand)
        hero.addView(space(13))
        hero.addView(text(t("heroTitle1"), 30f, paper, true))
        hero.addView(text(t("heroTitle2"), 29f, orange, true))
        hero.addView(space(11))
        hero.addView(text(t("heroDescription"), 13f, 0xffcbdce3.toInt()))
        content.addView(hero)
        val form = col(paper).apply { setPadding(px(18), px(18), px(18), px(19)) }
        form.addView(text(t("findCar"), 19f, ink, true))
        form.addView(space(10))
        form.addView(iconText(R.drawable.limba_vehicle_cards, t("swipe"), { navigate("swipe") }, true))
        form.addView(space(12))
        val makes = brands.optJSONArray("makes")
        val makeItems = mutableListOf<String>()
        if (makes != null) for (i in 0 until makes.length()) makeItems.add(makes.optString(i))
        form.addView(label(t("make")))
        val makeField = autoComplete(make, t("allMakes"), makeItems) { make = it }
        form.addView(makeField, lp(-1, 49))
        form.addView(label(t("model")))
        val modelArr = brands.optJSONObject("models")?.optJSONArray(canonicalBrand(make))
        val models = mutableListOf<String>()
        if (modelArr != null) for (i in 0 until modelArr.length()) models.add(modelArr.optString(i))
        val modelField = autoComplete(model, t("allModels"), models) { model = it }
        form.addView(modelField, lp(-1, 49))
        makeField.addTextChangedListener(object : android.text.TextWatcher {
            override fun beforeTextChanged(s: CharSequence?, start: Int, count: Int, after: Int) {}
            override fun onTextChanged(s: CharSequence?, start: Int, before: Int, count: Int) {
                val arr = brands.optJSONObject("models")?.optJSONArray(canonicalBrand(s.toString()))
                val choices = mutableListOf<String>()
                if (arr != null) for (i in 0 until arr.length()) choices.add(arr.optString(i))
                modelField.setAdapter(ArrayAdapter(this@MainActivity, android.R.layout.simple_dropdown_item_1line, choices))
            }
            override fun afterTextChanged(s: android.text.Editable?) {}
        })
        val priceField = editField(form, t("priceTo"), maxPrice, "€", true)
        val yearField = editField(form, t("yearFrom"), yearFrom, "2013", true)
        val kmField = editField(form, t("mileageTo"), maxMileage, "km", true)
        val search = btn(t("showResults"), true) {
            make = makeField.text.toString().trim()
            model = modelField.text.toString().trim(); maxPrice = priceField.text.toString().trim()
            yearFrom = yearField.text.toString().trim(); maxMileage = kmField.text.toString().trim()
            renderHome()
        }
        form.addView(space(17))
        form.addView(search)
        form.addView(space(8))
        form.addView(iconText(R.drawable.limba_filter, t("moreFilters"), { showAdvanced() }))
        val actions = row()
        actions.addView(btn(t("resetFilters"), false) { clearFilters(); renderHome() }, LinearLayout.LayoutParams(0, px(46), 1f))
        actions.addView(spaceHorizontal(8))
        actions.addView(btn(t("saveSearch"), false) { saveSearch() }, LinearLayout.LayoutParams(0, px(46), 1f))
        form.addView(space(8));form.addView(actions)
        content.addView(form)
        val results = col().apply { setPadding(px(17), px(22), px(17), px(20)) }
        results.addView(text(t("latestCars"), 21f, ink, true))
        results.addView(space(7))
        results.addView(btn(t("swipe"), false) { navigate("swipe") })
        results.addView(space(10))
        results.addView(text(t("singleDemoNotice"), 12f, muted))
        results.addView(space(17))
        var listed = false
        cloudCars.filter { matchesCar(it) }.forEach { results.addView(previewCard(it));results.addView(space(12));listed = true }
        previewCars.filter { matchesPreview(it) }.forEach { results.addView(previewCard(it));results.addView(space(12));listed = true }
        if (listingAvailable()) { results.addView(carCard());listed = true }
        if (!listed) emptyState(results,t("emptyCars"))
        results.addView(space(16))
        results.addView(btn(t("yourSavedSearch"), false) { navigate("searches") })
        results.addView(space(9))
        results.addView(btn(t("addVehicle"), false) { showCarForm() })
        content.addView(results)
        body(main, content)
        navigation(main)
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
        if (keyword.isNotBlank() && !(x.optString("make")+" "+x.optString("model")+" "+x.optString("city")+" "+x.optString("description")).contains(keyword,ignoreCase=true)) return false
        if (make.isNotBlank() && !x.optString("make").contains(make,ignoreCase=true)) return false
        if (model.isNotBlank() && !x.optString("model").contains(model,ignoreCase=true)) return false
        if (maxPrice.toIntOrNull()?.let { x.optInt("price") > it } == true) return false
        if (minPrice.toIntOrNull()?.let { x.optInt("price") < it } == true) return false
        if (yearFrom.toIntOrNull()?.let { x.optInt("year") < it } == true) return false
        if (yearTo.toIntOrNull()?.let { x.optInt("year") > it } == true) return false
        if (maxMileage.toIntOrNull()?.let { x.optInt("mileage") > it } == true) return false
        if (fuel.isNotBlank() && fuel != x.optString("fuel")) return false
        if (transmission.isNotBlank() && transmission != x.optString("transmission")) return false
        if (body.isNotBlank() && body != x.optString("body")) return false
        if (sellerType.isNotBlank() && sellerType != x.optString("sellerType")) return false
        return true
    }
    private fun previewCard(car: JSONObject): LinearLayout {
        val view=col(paper).apply { background=c(paper,16,border);setPadding(px(15),px(14),px(15),px(17)) }
        val badge=row();badge.addView(drawableIcon(R.drawable.limba_car,orange,35),lp(35,35));badge.addView(spaceHorizontal(9))
        val live = car.optString("id") !in previewCars.map { it.optString("id") }
        badge.addView(text(if(live)t("privateSeller")else t("previewOnly"),12f,orange,true));view.addView(badge)
        if (live && car.optString("image").isNotBlank()) {
            val photo = ImageView(this).apply { scaleType = ImageView.ScaleType.CENTER_CROP }
            view.addView(photo, lp(-1, 160))
            com.bumptech.glide.Glide.with(this).load(car.optString("image")).centerCrop().into(photo)
        }
        view.addView(space(8))
        view.addView(text(car.optString("make")+" "+car.optString("model"),20f,ink,true))
        view.addView(space(5))
        view.addView(text(car.optInt("year").toString()+" · "+number(car.optInt("mileage"))+" km · "+car.optInt("power")+" PS",13f,muted))
        view.addView(text(car.optString("city")+" · "+car.optString("country"),12f,muted))
        view.addView(space(8))
        view.addView(text(euro(car.optInt("price")),23f,orange,true))
        val trust=text("★ — · "+t("socialProfile"),11f,muted)
        view.addView(trust)
        if(live && ::social.isInitialized) social.getProfile(car.optString("uid")) { profile ->
            if(profile!=null) trust.text="★ "+(profile.getDouble("sellerRatingAverage") ?: 0.0).toString()+
                " ("+(profile.getLong("sellerRatingCount") ?: 0)+") · "+
                (if(profile.getBoolean("phoneVerified")==true)"✓ "else "")+
                (profile.getString("alias") ?: t("socialProfile"))
        }
        view.addView(space(10))
        val liked=if(live)car.optString("id") in cloudStars else car.optString("id") in previewStars
        view.addView(iconText(R.drawable.limba_favorites,t("saveFavourites"),{
            val id=car.optString("id")
            if (live) {
                if(cloudUser==null){showAccount()} else backend.toggleFavorite(id,id !in cloudStars) { error ->
                    if(error!=null)toast(error)
                }
            } else {
                if(id in previewStars)previewStars.remove(id)else previewStars.add(id)
                prefs.edit().putStringSet("previewStars",previewStars.toSet()).apply();render()
            }
        },liked))
        view.addView(space(7))
        view.addView(iconText(R.drawable.limba_info,t("vehicleProfile"),{
            activePreviewCar=car;openDetails(if(screen=="mine")"mine"else "home")
        },true))
        return view
    }
    private fun emptyState(parent: LinearLayout, msg: String) {
        val box = col(paper).apply { gravity = Gravity.CENTER; setPadding(px(18), px(38), px(18), px(38)); background = c(paper, 15, border) }
        box.addView(drawableIcon(R.drawable.limba_search, orange, 36), lp(36, 36))
        box.addView(text(msg, 14f, muted).apply { gravity = Gravity.CENTER })
        parent.addView(box)
    }

    private fun showAdvanced() {
        val panel=col().apply { setPadding(px(14),px(2),px(14),px(16)) }
        val freeText=editField(panel,t("advancedKeyword"),keyword,t("keywordExample"))
        val min=editField(panel,t("priceFrom"),minPrice,"€",true)
        val latestYear=editField(panel,t("yearTo"),yearTo,"2020",true)
        var chosenFuel=fuel;var chosenTransmission=transmission;var chosenBody=body;var chosenSeller=sellerType
        picker(panel,t("fuel"),listOf("" to t("allFuel"),"petrol" to t("petrol"),
            "diesel" to t("diesel"),"hybrid" to t("hybrid"),"electric" to t("electric")),chosenFuel){ chosenFuel=it }
        picker(panel,t("transmission"),listOf("" to t("allTransmission"),
            "automatic" to t("automatic"),"manual" to t("manual")),chosenTransmission){ chosenTransmission=it }
        picker(panel,t("body"),listOf("" to t("allBody"),"suv" to t("suv"),
            "sedan" to t("sedan"),"wagon" to t("wagon"),
            "hatchback" to t("hatchback"),"coupe" to t("coupe")),chosenBody){ chosenBody=it }
        picker(panel,t("sellerType"),listOf("" to t("allSeller"),
            "privateSeller" to t("privateSeller"),"dealer" to t("dealer")),chosenSeller){ chosenSeller=it }
        val scroller=ScrollView(this).apply {addView(panel);isFillViewport=false}
        AlertDialog.Builder(this).setTitle(t("moreFilters")).setView(scroller)
            .setPositiveButton(t("showResults")) { _,_ ->
                keyword=freeText.text.toString().trim()
                minPrice=min.text.toString().trim()
                yearTo=latestYear.text.toString().trim()
                fuel=chosenFuel;transmission=chosenTransmission;body=chosenBody;sellerType=chosenSeller
                renderHome()
            }
            .setNegativeButton(t("cancel"),null).show()
    }
    private fun clearFilters() {
        keyword="";make="";model="";maxPrice="";minPrice="";yearFrom="";yearTo=""
        maxMileage="";fuel="";transmission="";body="";sellerType=""
    }
    private fun saveSearch() {
        val arr = runCatching { JSONArray(prefs.getString("searches", "[]")) }.getOrElse { JSONArray() }
        arr.put(JSONObject().apply {
            put("keyword", keyword);put("make", make);put("model", model)
            put("maxPrice", maxPrice);put("minPrice", minPrice);put("yearFrom", yearFrom);put("yearTo", yearTo);put("maxMileage", maxMileage)
            put("fuel", fuel);put("transmission", transmission);put("body", body);put("sellerType",sellerType)
            put("countries", JSONArray(activeCountry.toList()))
        })
        prefs.edit().putString("searches", arr.toString()).apply()
        saveCount = arr.length(); toast(t("searchTitleSaved"))
    }
    private fun setFavorite(value: Boolean) { starred = value; prefs.edit().putBoolean("favorite", value).apply() }
    private fun openDetails(from: String) { backFromDetail = from; navigate("details") }

    private fun renderFavorites() {
        val main = container();toolbar(main, t("saved"))
        val content = col().apply { setPadding(px(17), px(20), px(17), px(20)) }
        content.addView(text(t("savedCars"), 22f, ink, true))
        content.addView(space(18))
        var any = false
        cloudCars.filter { it.optString("id") in cloudStars }.forEach {
            content.addView(previewCard(it));content.addView(space(11));any = true
        }
        previewCars.filter { it.optString("id") in previewStars && matchesPreview(it) }.forEach {
            content.addView(previewCard(it));content.addView(space(11));any = true
        }
        if (starred) { content.addView(carCard());any=true }
        if (!any) emptyState(content, t("noCarsSaved"))
        body(main, content);navigation(main)
    }
    private fun renderSavedSearches() {
        val main = container();toolbar(main, t("yourSavedSearch"), {navigate("home")})
        val content = col().apply { setPadding(px(17),px(20),px(17),px(20)) }
        val savedHeader = row()
        savedHeader.addView(drawableIcon(R.drawable.limba_notifications, orange, 29), lp(29,29))
        savedHeader.addView(spaceHorizontal(10))
        savedHeader.addView(text(t("yourSavedSearch"), 22f, ink, true))
        content.addView(savedHeader);content.addView(space(18))
        val stored = runCatching { JSONArray(prefs.getString("searches","[]")) }.getOrElse { JSONArray() }
        if (stored.length()==0) emptyState(content,t("noSearches"))
        for (i in 0 until stored.length()) {
            val item = stored.optJSONObject(i) ?: continue
            val summary = (listOf(item.optString("make"),item.optString("model"),item.optString("keyword")).filter { it.isNotBlank() }.joinToString(" ")).ifBlank { t("allCars") }
            val cell = col(paper).apply { setPadding(px(14),px(12),px(14),px(12));background=c(paper,14,border) }
            val rowTitle = row()
            rowTitle.addView(drawableIcon(R.drawable.limba_search, orange, 21), lp(21, 21))
            rowTitle.addView(spaceHorizontal(9))
            rowTitle.addView(text(summary,16f,ink,true))
            cell.addView(rowTitle)
            cell.addView(space(6));cell.addView(text(t("searchSaveLabel")+" #${i+1}",12f,muted))
            cell.setOnClickListener {
                keyword=item.optString("keyword");make=item.optString("make");model=item.optString("model")
                maxPrice=item.optString("maxPrice");minPrice=item.optString("minPrice");yearFrom=item.optString("yearFrom");yearTo=item.optString("yearTo");maxMileage=item.optString("maxMileage")
                fuel=item.optString("fuel");transmission=item.optString("transmission");body=item.optString("body");sellerType=item.optString("sellerType")
                val arr=item.optJSONArray("countries");activeCountry=mutableSetOf()
                if(arr!=null) for(z in 0 until arr.length()) activeCountry.add(arr.optString(z))
                navigate("home")
            }
            content.addView(cell);content.addView(space(9))
        }
        body(main,content);navigation(main)
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
            prefs.edit().putStringSet("countries",activeCountry.toSet()).apply();navigate("home")
        });content.addView(space(19))
        content.addView(iconText(R.drawable.limba_notifications, t("yourSavedSearch"), {navigate("searches")}))
        content.addView(space(12))
        content.addView(iconText(R.drawable.limba_vehicle_cards,t("myAds"),{navigate("mine")}))
        body(main,content);navigation(main)
    }

    private fun swipeCandidates(): List<JSONObject?> {
        val cars=(cloudCars.filter { matchesCar(it) } + previewCars.filter { matchesPreview(it) })
            .map { it as JSONObject? }.toMutableList()
        if (listingAvailable()) cars.add(null) // null identifies the built-in Nissan GT-R sample
        return cars
    }
    private fun renderSwipe() {
        val main=container()
        main.setBackgroundColor(navy)
        val all=swipeCandidates()
        if (all.isEmpty()) {
            val empty=col().apply {gravity=Gravity.CENTER;setPadding(px(20),px(20),px(20),px(20))}
            empty.addView(text(t("emptyCars"),20f,paper,true))
            empty.addView(space(20));empty.addView(btn(t("backToMarket"),true){navigate("home")})
            main.addView(empty,LinearLayout.LayoutParams(-1,0,1f))
            navigation(main)
            return
        }
        swipeIndex=swipeIndex.coerceIn(0,all.size-1)
        val current=all[swipeIndex]
        val full=FrameLayout(this)
        main.addView(full,LinearLayout.LayoutParams(-1,0,1f))
        navigation(main)
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
        val title=if(current==null)"Nissan GT-R R35 Black Edition"else current.optString("make")+" "+current.optString("model")
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
        val live = car.optString("id") !in previewCars.map { it.optString("id") }
        content.addView(text(if(live)t("carsNav")else t("previewOnly"),12f,orange,true))
        content.addView(space(8))
        if(live && car.optString("image").startsWith("https://")){
            val photo=ImageView(this).apply{scaleType=ImageView.ScaleType.CENTER_CROP}
            content.addView(photo,lp(-1,240))
            com.bumptech.glide.Glide.with(this).load(car.optString("image")).centerCrop().into(photo)
            content.addView(space(12))
        }
        content.addView(text(car.optString("make")+" "+car.optString("model"),25f,ink,true))
        content.addView(space(7));content.addView(text(euro(car.optInt("price")),25f,orange,true));content.addView(space(16))
        val details=listOf(
            t("make") to car.optString("make"),t("model") to car.optString("model"),
            t("firstReg") to car.optString("year"),t("mileage") to (number(car.optInt("mileage"))+" km"),
            t("power") to (car.optString("power")+" PS"),t("fuel") to t(car.optString("fuel")),
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
        if(!live)content.addView(text(t("previewNotSynced"),12f,muted))
        if(live){
            val uid=car.optString("uid")
            val seller=text(t("socialSeller")+" · ★ —",14f,muted,true)
            content.addView(seller)
            if(::social.isInitialized) social.getProfile(uid) { profile ->
                if(profile!=null)seller.text=(profile.getString("alias") ?: t("socialSeller"))+
                    " · ★ "+(profile.getDouble("sellerRatingAverage") ?: 0.0).toString()+
                    " ("+(profile.getLong("sellerRatingCount") ?: 0)+")"+
                    if(profile.getBoolean("phoneVerified")==true)" ✓" else ""
            }
            content.addView(btn(t("socialMessage"),true) {
                social.beginConversation(car.optString("id")) { id,error ->
                    if(error!=null)toast(error) else if(id!=null){activeConversation=id;navigate("chat")}
                }
            })
            content.addView(space(8))
            content.addView(btn(t("socialOffer"),false) {
                social.beginConversation(car.optString("id")) { id,error ->
                    if(error!=null)toast(error) else if(id!=null){activeConversation=id;navigate("chat")}
                }
            })
            content.addView(space(9))
            content.addView(btn(t("reportCar"),false) {
                if(cloudUser==null){showAccount()} else AlertDialog.Builder(this)
                    .setTitle(t("reportCar"))
                    .setItems(arrayOf(t("reportFraud"),t("reportDuplicate"),t("reportInappropriate"),t("reportOther"))) { _,choice ->
                        social.report("listing",car.optString("id"),listOf("fraud","duplicate","inappropriate","other")[choice]) { error ->
                            toast(error ?: t("reportSent"))
                        }
                    }.show()
            })
        }
        content.addView(space(15))
        content.addView(btn(t("backToListing"),true){activePreviewCar=null;navigate(backFromDetail)})
        body(main,content)
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
            val choices = arrayOf(t("myAds"),t("refreshVerification"),t("sendVerification"),t("signOut"))
            AlertDialog.Builder(this).setTitle(user.email ?: "Limba")
                .setMessage(if(user.isEmailVerified)t("verifiedBadge") else t("notVerified"))
                .setItems(choices) { _,which ->
                    when(which) {
                        0 -> navigate("mine")
                        1 -> backend.refreshVerification { confirmed ->
                            toast(if(confirmed)t("verifiedBadge")else t("notVerified"));render()
                        }
                        2 -> backend.sendVerification { err -> toast(err ?: t("checkEmail")) }
                        3 -> backend.auth?.signOut()
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
        val modelField=autoComplete(existing?.optString("model")?:"",t("model"),emptyList()){};col.addView(modelField,lp(-1,48))
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
        val sellerTypes=listOf("privateSeller","dealer")
        val seller=spinner(t("sellerType"),sellerTypes.map { it to t(it) })
        existing?.let {seller.setSelection(sellerTypes.indexOf(it.optString("sellerType")).coerceAtLeast(0))}
        col.addView(label(t("vehicleDescription")))
        val desc=EditText(this).apply { setTextColor(ink);minLines=3;maxLines=6;setPadding(px(13),px(10),px(13),px(10));background=c(paper,12,border) }
        desc.setText(existing?.optString("description") ?: "")
        col.addView(desc,lp(-1,110))
        if(!isPreview && existing==null){
            pickedImages.clear()
            col.addView(space(12))
            col.addView(btn(t("listingPhotos"),false){
                val intent=Intent(Intent.ACTION_OPEN_DOCUMENT).apply{
                    type="image/*";addCategory(Intent.CATEGORY_OPENABLE)
                    putExtra(Intent.EXTRA_ALLOW_MULTIPLE,true)
                }
                startActivityForResult(intent,pickPhotosRequest)
            })
            pickedImagesLabel=text("0 / 6",12f,muted)
            col.addView(pickedImagesLabel)
        }
        val scroll=ScrollView(this);scroll.addView(col)
        AlertDialog.Builder(this).setTitle(t("vehicleProfile")).setView(scroll)
            .setPositiveButton(if(isPreview)t("savePreviewCar")else if(existing!=null)t("editAd")else t("publish"),null)
            .setNegativeButton(t("cancelPreview"),null)
            .create().also{dlg->
                dlg.setOnShowListener { dlg.getButton(AlertDialog.BUTTON_POSITIVE).setOnClickListener {
                    val mk=canonicalBrand(makeField.text.toString());val mdl=modelField.text.toString().trim()
                    val yr=year.text.toString().toIntOrNull();val km=mileage.text.toString().toIntOrNull();val hp=power.text.toString().toIntOrNull();val eur=price.text.toString().toIntOrNull()
                    val town=city.text.toString().trim();val description=desc.text.toString().trim()
                    if(mk.length !in 2..35||mdl.length !in 1..65||yr==null||yr !in 1950..(java.util.Calendar.getInstance().get(java.util.Calendar.YEAR)+1)||km==null||km !in 0..1500000||hp==null||hp !in 1..2000||eur==null||eur !in 1..999999999||town.isBlank()||description.length<15){toast(t("requiredFields"));return@setOnClickListener}
                    val car=JSONObject().put("id",existing?.optString("id") ?: "preview-"+System.currentTimeMillis())
                        .put("uid",if(isPreview)previewUser else cloudUser?.uid ?: "")
                        .put("make",mk).put("model",mdl).put("year",yr).put("mileage",km).put("power",hp).put("price",eur)
                        .put("city",town).put("country",countries[country.selectedItemPosition].first).put("fuel",fuels[fuel.selectedItemPosition])
                        .put("transmission",gearbox[trans.selectedItemPosition]).put("body",bodies[body.selectedItemPosition])
                        .put("condition",conditions[condition.selectedItemPosition]).put("accidentStatus",accidents[accident.selectedItemPosition])
                        .put("conditionNote",note.text.toString().trim().take(240)).put("description",description.take(3000))
                        .put("sellerType",sellerTypes[seller.selectedItemPosition])
                        .put("contactEmail","")
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
                listOf("active","paused").forEach { status ->
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
        content.addView(iconText(R.drawable.limba_add_car,t("addVehicle"),{showCarForm()},true))
        if(previewUser.isNotBlank()){content.addView(space(10));content.addView(text(t("previewNotSynced"),12f,muted))}
        body(main,content);navigation(main)
    }

    // All new social screens use the same native Android view hierarchy as the rest of Limba.
    private fun renderMessages() {
        val main=container();toolbar(main,t("socialMessages"),{navigate("home")})
        val content=col().apply {setPadding(px(17),px(18),px(17),px(26))}
        content.addView(text(t("socialMessages"),23f,ink,true))
        body(main,content);navigation(main)
        if(!social.ready || social.uid==null) {
            content.addView(btn(t("login"),true){showAccount()});return
        }
        val listener=social.watchConversations({ rows ->
            if(screen!="messages")return@watchConversations
            content.removeViews(1,(content.childCount-1).coerceAtLeast(0))
            if(rows.isEmpty())emptyState(content,t("socialNoMessages"))
            rows.forEach { d ->
                val c=d.data ?: emptyMap<String,Any>()
                content.addView(btn(
                    (c["lastMessagePreview"] as? String).orEmpty().ifBlank{t("socialMessage")},
                    false) {activeConversation=d.id;navigate("chat")})
                content.addView(space(10))
            }
        },{e->toast(e)})
        if(listener!=null)socialListeners.add(listener)
    }

    private fun renderConversation() {
        val id=activeConversation
        val main=container();toolbar(main,t("socialMessages"),{navigate("messages")})
        val content=col().apply {setPadding(px(15),px(15),px(15),px(26))}
        val conversationTitle=text(t("socialMessages"),22f,ink,true)
        content.addView(conversationTitle);content.addView(space(12))
        val messagePane=col(paper).apply {background=c(paper,14,border);setPadding(px(12),px(12),px(12),px(12))}
        messagePane.addView(text(t("socialNoMessages"),13f,muted))
        content.addView(messagePane);content.addView(space(14))
        val offerPane=col()
        content.addView(offerPane)
        val transactionPane=col()
        content.addView(transactionPane)
        val write=EditText(this).apply {hint=t("socialWriteMessage");minHeight=px(50);background=c(paper,10,border)}
        content.addView(write);content.addView(space(8))
        content.addView(btn(t("socialSend"),true) {
            val body=write.text.toString().trim()
            if(body.length !in 1..1000){toast("1–1000");return@btn}
            social.sendMessage(id,body) { e ->if(e==null)write.text.clear() else toast(e) }
        })
        content.addView(space(16))
        val negotiation=col(paper).apply {
            background=c(paper,14,border)
            setPadding(px(13),px(14),px(13),px(14))
            visibility=View.GONE // Only the authenticated buyer can propose a price.
        }
        negotiation.addView(text(t("socialProposePrice"),17f,ink,true))
        negotiation.addView(space(7))
        negotiation.addView(text(t("socialOfferGuidance"),12f,muted))
        negotiation.addView(space(9))
        val quotaLabel=text(t("socialOfferQuotaLoading"),12f,orange,true)
        quotaLabel.contentDescription=t("socialOfferQuotaLoading")
        negotiation.addView(quotaLabel)
        negotiation.addView(space(9))
        val amount=EditText(this).apply {
            hint=t("socialOffer")+" €"
            inputType=InputType.TYPE_CLASS_NUMBER
            background=c(paper,10,border);minHeight=px(50)
            setPadding(px(12),px(10),px(12),px(10))
        }
        negotiation.addView(amount);negotiation.addView(space(8))
        var inFlight=false
        fun refreshQuota(){
            social.getOfferQuota{remaining,error->
                if(screen!="chat"||id!=activeConversation)return@getOfferQuota
                if(remaining!=null){
                    quotaLabel.text=t("socialOfferQuotaRemaining")
                        .replace("{remaining}",remaining.toString()).replace("{limit}","3")
                    quotaLabel.contentDescription=quotaLabel.text
                    amount.isEnabled=remaining>0
                } else quotaLabel.text=error ?: t("socialOfferQuotaUnavailable")
            }
        }
        val submit=btn(t("socialProposePrice"),false) {
            if(inFlight)return@btn
            val price=amount.text.toString().toIntOrNull()
            if(price==null || price !in 1..999999999){toast("1–999999999 €");return@btn}
            inFlight=true
            social.createOffer(id,price) { err ->
                inFlight=false
                if(err!=null)toast(err)
                else {amount.text.clear();toast(t("socialOfferSent"))}
                refreshQuota()
            }
        }
        negotiation.addView(submit)
        content.addView(negotiation)
        content.addView(space(14))
        content.addView(text(t("socialNoPayment"),12f,muted))
        social.isConversationBuyer(id){isBuyer->
            if(screen!="chat"||id!=activeConversation)return@isConversationBuyer
            if(isBuyer==true){negotiation.visibility=View.VISIBLE;refreshQuota()}
        }
        body(main,content);navigation(main)
        social.watchMessages(id) { rows ->
            if(screen!="chat"||id!=activeConversation)return@watchMessages
            messagePane.removeAllViews()
            if(rows.isEmpty())messagePane.addView(text(t("socialNoMessages"),13f,muted))
            rows.forEach { snap ->
                val d=snap.data ?: emptyMap<String,Any>()
                val mine=d["senderUid"]==social.uid
                val bubble=col(if(mine)0xffe0efff.toInt() else mist).apply {
                    background=c(if(mine)0xffe0efff.toInt() else mist,12)
                    setPadding(px(12),px(10),px(12),px(10))
                }
                bubble.addView(text((d["text"] as? String).orEmpty(),14f,ink))
                messagePane.addView(bubble);messagePane.addView(space(6))
            }
        }?.let { socialListeners.add(it) }
        social.watchOffers(id) { rows ->
            if(screen!="chat"||id!=activeConversation)return@watchOffers
            offerPane.removeAllViews()
            rows.sortedByDescending { it.getTimestamp("createdAt")?.seconds ?: 0L }.forEach { offer ->
                val status=offer.getString("status").orEmpty()
                val line=col(paper).apply {background=c(paper,12,border);setPadding(px(10),px(10),px(10),px(10))}
                line.addView(text(euro((offer.getLong("amountEur") ?: 0L).toInt())+
                    " · "+status,15f,ink,true))
                if(status=="open"&&offer.getString("creatorUid")!=social.uid){
                    val key=id+"~"+offer.id
                    line.addView(btn(t("socialAccept"),true){
                        social.respond(key,true){e->if(e!=null)toast(e)}
                    })
                    line.addView(btn(t("socialReject"),false){
                        social.respond(key,false){e->if(e!=null)toast(e)}
                    })
                }
                offerPane.addView(line);offerPane.addView(space(8))
            }
        }?.let { socialListeners.add(it) }
        social.watchTransaction(id) { trans ->
            if(screen!="chat"||id!=activeConversation)return@watchTransaction
            transactionPane.removeAllViews()
            if(trans?.exists()!=true)return@watchTransaction
            val status=trans.getString("status").orEmpty()
            transactionPane.addView(text(t("socialTransaction")+" · "+status,18f,ink,true))
            when {
                status=="reserved"&&trans.getString("sellerUid")==social.uid ->
                    transactionPane.addView(btn(t("socialHandover"),true){
                        social.handover(id){e->if(e!=null)toast(e)}
                    })
                status=="handover_confirmed"&&trans.getString("buyerUid")==social.uid ->
                    transactionPane.addView(btn(t("socialPurchase"),true){
                        social.purchase(id){e->if(e!=null)toast(e)}
                    })
                status=="completed"->transactionPane.addView(btn(t("socialReview"),true){
                    showSocialReview(id,trans)
                })
            }
            transactionPane.addView(space(12))
        }?.let { socialListeners.add(it) }
    }

    private fun showSocialReview(transactionId:String,transaction:DocumentSnapshot) {
        social.getReview(transactionId){ old ->
            val status=old?.getString("status")
            val stamp=old?.getTimestamp("createdAt")?.toDate()?.time ?: 0L
            if(status=="withdrawn"){toast(t("socialWithdrawn"));return@getReview}
            val editAllowed=old==null||!old.exists()||System.currentTimeMillis()-stamp<30*60*1000L
            val holder=col().apply {setPadding(px(16),px(8),px(16),px(8))}
            val stars=Spinner(this).apply {
                adapter=ArrayAdapter(this@MainActivity,android.R.layout.simple_spinner_dropdown_item,
                    listOf("1 ★","2 ★","3 ★","4 ★","5 ★"))
                setSelection(((old?.getLong("stars") ?: 5L).toInt()-1).coerceIn(0,4))
            }
            holder.addView(stars,lp(-1,54))
            val buyerRole=transaction.getString("sellerUid")==social.uid
            val tags=if(buyerRole) listOf("goodCommunication","punctual","reliable","smoothClosing")
                     else listOf("descriptionAccurate","goodCommunication","reliable","goodHandover")
            val checks=tags.map { tag ->CheckBox(this).apply { text=t("socialTag_"+tag)
                isChecked=(old?.get("tags") as? List<*>)?.contains(tag)==true;minHeight=px(44)
                holder.addView(this,lp(-1,44))} }
            val comment=EditText(this).apply {
                hint=t("socialComment");setText(old?.getString("comment").orEmpty());maxLines=5
                filters=arrayOf(android.text.InputFilter.LengthFilter(500))
            }
            holder.addView(comment,lp(-1,100))
            val builder=AlertDialog.Builder(this).setTitle(t("socialReview")).setView(holder)
                .setNegativeButton(t("cancelPreview"),null)
            if(editAllowed)builder.setPositiveButton(t("socialSave")) { _,_ ->
                val selected=checks.filter{it.isChecked}.map { tags[checks.indexOf(it)] }
                if(selected.size>3){toast(t("socialThreeTags"));return@setPositiveButton}
                val done:(String?)->Unit={error->toast(error ?: t("socialSaved"))}
                val count=stars.selectedItemPosition+1
                if(old?.exists()==true)social.editReview(transactionId+"_"+social.uid,count,selected,comment.text.toString(),done)
                else social.submitReview(transactionId,count,selected,comment.text.toString(),done)
            }
            if(status=="visible")builder.setNeutralButton(t("socialWithdraw")) { _,_ ->
                social.withdrawReview(transactionId+"_"+social.uid){error->toast(error ?: t("socialWithdrawn"))}
            }
            builder.show()
        }
    }

    private fun renderSocialProfile() {
        val main=container();toolbar(main,t("socialProfile"),{navigate("home")})
        val content=col().apply {setPadding(px(18),px(18),px(18),px(26))}
        content.addView(text(t("socialProfile"),24f,ink,true));content.addView(space(10))
        body(main,content);navigation(main)
        if(social.uid==null){content.addView(btn(t("login"),true){showAccount()});return}
        social.getProfile(social.uid!!){ profile ->
            if(screen!="profile")return@getProfile
            val data=profile
            val alias=data?.getString("alias") ?: (cloudUser?.email?.substringBefore("@") ?: "Mitglied")
            val existing=content.childCount
            if(existing>1)content.removeViews(1,existing-1)
            content.addView(text(alias,22f,ink,true));content.addView(space(8))
            content.addView(text(t("socialSeller")+" ★ "+
                (data?.getDouble("sellerRatingAverage") ?: 0.0)+" ("+
                (data?.getLong("sellerRatingCount") ?: 0L)+")",15f,muted))
            content.addView(text(t("socialBuyer")+" ★ "+
                (data?.getDouble("buyerRatingAverage") ?: 0.0)+" ("+
                (data?.getLong("buyerRatingCount") ?: 0L)+")",15f,muted))
            content.addView(space(14))
            val input=EditText(this).apply {setText(alias);hint=t("socialAlias")}
            content.addView(input,lp(-1,50))
            content.addView(btn(t("socialSave"),false){
                social.saveAlias(input.text.toString()){e->
                    if(e!=null)toast(e)else {toast(t("socialSaved"));renderSocialProfile()}
                }
            })
            content.addView(space(12))
            content.addView(text(if(social.linkedPhone)t("socialVerified")else t("socialNotVerified"),13f,muted))
            content.addView(btn(t("socialPhone"),false){
                social.linkPhone({toast(t("socialVerified"));renderSocialProfile()},{e->toast(e)})
            })
            content.addView(space(10))
            content.addView(btn(t("socialPush"),false){
                social.enablePush { e ->toast(e ?: t("socialSaved")) }
            })
            content.addView(space(18))
            content.addView(text(t("socialReviews"),20f,ink,true))
            val reviews=col()
            content.addView(reviews)
            social.watchReviews(social.uid!!){ snapshots ->
                if(screen!="profile")return@watchReviews
                reviews.removeAllViews()
                val seller=snapshots.filter{it.getString("revieweeRole")=="seller"}
                val buyer=snapshots.filter{it.getString("revieweeRole")=="buyer"}
                reviews.addView(text(t("socialSeller"),17f,ink,true))
                seller.forEach{reviews.addView(text("★ "+it.getLong("stars")+
                    " · "+it.getString("comment").orEmpty(),13f,muted))}
                if(seller.isEmpty())reviews.addView(text(t("socialNoReviews"),13f,muted))
                reviews.addView(space(12));reviews.addView(text(t("socialBuyer"),17f,ink,true))
                buyer.forEach{reviews.addView(text("★ "+it.getLong("stars")+
                    " · "+it.getString("comment").orEmpty(),13f,muted))}
                if(buyer.isEmpty())reviews.addView(text(t("socialNoReviews"),13f,muted))
            }?.let { socialListeners.add(it) }
        }
    }

    private fun showBackendInfo() {
        AlertDialog.Builder(this).setTitle(t("registerToSell"))
            .setMessage(t("authUnavailable")+"\n\n"+t("demoOnly"))
            .setPositiveButton("OK",null).show()
    }
    override fun onDestroy() { clearSocialSubscriptions();if(::backend.isInitialized) backend.close(); super.onDestroy() }

    @Deprecated("Activity result API retained for compatibility with Activity base class")
    override fun onActivityResult(requestCode:Int,resultCode:Int,data:Intent?) {
        super.onActivityResult(requestCode,resultCode,data)
        if(requestCode!=pickPhotosRequest || resultCode!=RESULT_OK || data==null)return
        pickedImages.clear()
        data.clipData?.let { clip ->
            for(i in 0 until minOf(clip.itemCount,6))pickedImages.add(clip.getItemAt(i).uri)
        } ?: data.data?.let { pickedImages.add(it) }
        pickedImagesLabel?.text = "${pickedImages.size} / 6"
    }

    override fun onBackPressed() {
        when(screen){
            "details"->{activePreviewCar=null;navigate(backFromDetail)}
            "chat"->navigate("messages")
            "home"->super.onBackPressed()
            else->navigate("home")
        }
    }
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
