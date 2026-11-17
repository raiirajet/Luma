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
import org.json.JSONArray
import org.json.JSONObject
import java.text.NumberFormat
import java.util.Locale

/**
 * Luma Auto — native Android proof-of-concept.
 * This Activity uses Android Views throughout: no WebView, website frame or remote UI.
 * It deliberately does not emulate a Firebase login: the production backend has
 * not been configured. Demo listing information is fictional and identified as such.
 */
class MainActivity : Activity() {
    private val ink = Color.rgb(16, 43, 58)
    private val navy = Color.rgb(12, 40, 56)
    private val orange = Color.rgb(244, 119, 77)
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
    private var yearFrom = ""
    private var maxMileage = ""
    private var fuel = ""
    private var transmission = ""
    private var body = ""
    private var saveCount = 0
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
        window.statusBarColor = navy
        window.navigationBarColor = navy
        root = FrameLayout(this)
        setContentView(root)
        messages = JSONObject(assets.open("i18n.json").bufferedReader().use { it.readText() })
        brands = JSONObject(assets.open("brands.json").bufferedReader().use { it.readText() })
        locale = prefs.getString("language", "de") ?: "de"
        if (locale !in codes) locale = "de"
        starred = prefs.getBoolean("favorite", false)
        swipeSeen = prefs.getBoolean("swipeSeen", false)
        activeCountry = (prefs.getStringSet("countries", emptySet()) ?: emptySet()).toMutableSet()
        saveCount = prefs.getString("searches", "[]")?.let { runCatching { JSONArray(it).length() }.getOrDefault(0) } ?: 0
        try { assets.open("gtr.jpg").use { carPhoto = BitmapFactory.decodeStream(it) } } catch (_: Exception) { }
        render()
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
    private fun navigate(next: String) { screen = next; render() }
    private fun container(): LinearLayout {
        window.clearFlags(WindowManager.LayoutParams.FLAG_FULLSCREEN)
        root.removeAllViews()
        root.setBackgroundColor(mist)
        val main = col()
        root.addView(main, fp())
        return main
    }

    private fun toolbar(main: LinearLayout, section: String, back: (() -> Unit)? = null) {
        val line = row(paper)
        line.setPadding(px(16), px(8), px(16), px(8))
        val left = btn(if (back != null) "‹" else "✳", false) {
            if (back != null) back() else navigate("home")
        }
        left.textSize = 24f
        left.setTextColor(if (back != null) ink else orange)
        left.background = null
        line.addView(left, lp(42, 50))
        val headline = col()
        headline.addView(text("luma.", 25f, ink, true))
        headline.addView(text(section, 9f, muted, true))
        line.addView(headline, LinearLayout.LayoutParams(0, -2, 1f))
        if (section != t("settings")) {
            val settingsBtn = btn("⚙", false) { navigate("settings") }
            settingsBtn.textSize = 18f
            line.addView(settingsBtn, lp(48, 46))
        }
        main.addView(line, lp(-1, 65))
    }
    private fun navigation(main: LinearLayout) {
        val nav = row(paper).apply { gravity = Gravity.CENTER }
        val routes = listOf(
            Triple("home", "⌕", t("carsNav")), Triple("swipe", "◈", "Swipe"),
            Triple("favorites", "♡", t("saved")), Triple("settings", "⚙", t("settings"))
        )
        routes.forEach { (route, icon, name) ->
            val cell = col().apply { gravity = Gravity.CENTER; setPadding(px(3), px(5), px(3), px(5)) }
            cell.addView(text(icon, 23f, if (screen == route) orange else muted, true).apply { gravity = Gravity.CENTER })
            cell.addView(text(name, 10f, if (screen == route) ink else muted, screen == route).apply {
                gravity = Gravity.CENTER
                maxLines = 1
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
            val fallback = text("🏎", 90f, paper, true).apply { gravity = Gravity.CENTER }
            frame.addView(fallback, fp())
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
        if (yearFrom.toIntOrNull()?.let { 2013 < it } == true) return false
        if (maxMileage.toIntOrNull()?.let { 49500 > it } == true) return false
        if (fuel.isNotBlank() && fuel != "petrol") return false
        if (transmission.isNotBlank() && transmission != "automatic") return false
        if (body.isNotBlank() && body != "coupe") return false
        return true
    }

    private fun autoComplete(value: String, hint: String, suggestions: List<String>, callback: (String) -> Unit): AutoCompleteTextView {
        val field = AutoCompleteTextView(this).apply {
            setSingleLine(true); setTextSize(15f); setTextColor(ink); setHintTextColor(muted)
            setHint(hint); setText(value); threshold = 1
            setPadding(px(13), px(11), px(13), px(11))
            background = c(paper, 11, border)
            setAdapter(ArrayAdapter(this@MainActivity, android.R.layout.simple_dropdown_item_1line, suggestions))
            setOnFocusChangeListener { _, hasFocus -> if (!hasFocus) callback(text.toString().trim()) }
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
        hero.addView(text("✳ LUMA AUTO", 11f, orange, true))
        hero.addView(space(13))
        hero.addView(text(t("heroTitle1"), 30f, paper, true))
        hero.addView(text(t("heroTitle2"), 29f, orange, true))
        hero.addView(space(11))
        hero.addView(text(t("heroDescription"), 13f, 0xffcbdce3.toInt()))
        content.addView(hero)
        val form = col(paper).apply { setPadding(px(18), px(18), px(18), px(19)) }
        form.addView(text(t("findCar"), 19f, ink, true))
        form.addView(space(10))
        val keywordField = editField(form, t("searchTerms"), keyword, t("keywordExample"))
        val makes = brands.optJSONArray("makes")
        val makeItems = mutableListOf<String>()
        if (makes != null) for (i in 0 until makes.length()) makeItems.add(makes.optString(i))
        form.addView(label(t("make")))
        val makeField = autoComplete(make, t("allMakes"), makeItems) { make = it }
        form.addView(makeField, lp(-1, 49))
        form.addView(label(t("model")))
        val modelArr = brands.optJSONObject("models")?.optJSONArray(make)
        val models = mutableListOf<String>()
        if (modelArr != null) for (i in 0 until modelArr.length()) models.add(modelArr.optString(i))
        val modelField = autoComplete(model, t("allModels"), models) { model = it }
        form.addView(modelField, lp(-1, 49))
        makeField.addTextChangedListener(object : android.text.TextWatcher {
            override fun beforeTextChanged(s: CharSequence?, start: Int, count: Int, after: Int) {}
            override fun onTextChanged(s: CharSequence?, start: Int, before: Int, count: Int) {
                val arr = brands.optJSONObject("models")?.optJSONArray(s.toString())
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
            keyword = keywordField.text.toString().trim(); make = makeField.text.toString().trim()
            model = modelField.text.toString().trim(); maxPrice = priceField.text.toString().trim()
            yearFrom = yearField.text.toString().trim(); maxMileage = kmField.text.toString().trim()
            renderHome()
        }
        form.addView(space(17))
        form.addView(search)
        form.addView(space(8))
        form.addView(btn(t("moreFilters") + " · " + t("fuel") + " / " + t("transmission"), false) { showAdvanced() })
        val actions = row()
        actions.addView(btn(t("resetFilters"), false) { clearFilters(); renderHome() }, LinearLayout.LayoutParams(0, px(46), 1f))
        actions.addView(spaceHorizontal(8))
        actions.addView(btn(t("saveSearch"), false) { saveSearch() }, LinearLayout.LayoutParams(0, px(46), 1f))
        form.addView(space(8));form.addView(actions)
        content.addView(form)
        val results = col().apply { setPadding(px(17), px(22), px(17), px(20)) }
        results.addView(text(t("latestCars"), 21f, ink, true))
        results.addView(space(7))
        results.addView(text(t("singleDemoNotice"), 12f, muted))
        results.addView(space(17))
        if (listingAvailable()) results.addView(carCard()) else emptyState(results, t("emptyCars"))
        results.addView(space(16))
        results.addView(btn(t("yourSavedSearch"), false) { navigate("searches") })
        results.addView(space(9))
        results.addView(btn(t("sellCar"), false) { showBackendInfo() })
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
        priced.addView(btn(if (starred) "♥" else "♡", false) { setFavorite(!starred); renderHome() }, lp(56, 48))
        block.addView(priced)
        block.addView(space(9))
        block.addView(btn(t("vehicleDetails"), true) { openDetails("home") })
        block.addView(space(6))
        block.addView(text(t("demoOnly"), 11f, muted))
        card.addView(block)
        return card
    }
    private fun emptyState(parent: LinearLayout, msg: String) {
        val box = col(paper).apply { gravity = Gravity.CENTER; setPadding(px(18), px(38), px(18), px(38)); background = c(paper, 15, border) }
        box.addView(text("⌕", 34f, orange, true).apply { gravity = Gravity.CENTER })
        box.addView(text(msg, 14f, muted).apply { gravity = Gravity.CENTER })
        parent.addView(box)
    }

    private fun showAdvanced() {
        val panel = col().apply { setPadding(px(14), 0, px(14), px(12)) }
        picker(panel, t("fuel"), listOf("" to t("allFuel"), "petrol" to t("petrol"), "diesel" to t("diesel"), "hybrid" to t("hybrid"), "electric" to t("electric")), fuel) { fuel = it }
        picker(panel, t("transmission"), listOf("" to t("allTransmission"), "automatic" to t("automatic"), "manual" to t("manual")), transmission) { transmission = it }
        picker(panel, t("body"), listOf("" to t("allBody"), "suv" to t("suv"), "sedan" to t("sedan"), "wagon" to t("wagon"), "hatchback" to t("hatchback"), "coupe" to t("coupe")), body) { body = it }
        AlertDialog.Builder(this).setTitle(t("moreFilters")).setView(panel)
            .setPositiveButton(t("showResults")) { _, _ -> renderHome() }
            .setNegativeButton(t("cancel"), null).show()
    }
    private fun clearFilters() { keyword="";make="";model="";maxPrice="";yearFrom="";maxMileage="";fuel="";transmission="";body="" }
    private fun saveSearch() {
        val arr = runCatching { JSONArray(prefs.getString("searches", "[]")) }.getOrElse { JSONArray() }
        arr.put(JSONObject().apply {
            put("keyword", keyword);put("make", make);put("model", model)
            put("maxPrice", maxPrice);put("yearFrom", yearFrom);put("maxMileage", maxMileage)
            put("fuel", fuel);put("transmission", transmission);put("body", body)
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
        if (starred) content.addView(carCard()) else emptyState(content, t("noCarsSaved"))
        body(main, content);navigation(main)
    }
    private fun renderSavedSearches() {
        val main = container();toolbar(main, t("yourSavedSearch"), {navigate("home")})
        val content = col().apply { setPadding(px(17),px(20),px(17),px(20)) }
        content.addView(text(t("yourSavedSearch"), 22f, ink, true));content.addView(space(18))
        val stored = runCatching { JSONArray(prefs.getString("searches","[]")) }.getOrElse { JSONArray() }
        if (stored.length()==0) emptyState(content,t("noSearches"))
        for (i in 0 until stored.length()) {
            val item = stored.optJSONObject(i) ?: continue
            val summary = (listOf(item.optString("make"),item.optString("model"),item.optString("keyword")).filter { it.isNotBlank() }.joinToString(" ")).ifBlank { t("allCars") }
            val cell = col(paper).apply { setPadding(px(14),px(12),px(14),px(12));background=c(paper,14,border) }
            cell.addView(text("⌕  $summary",16f,ink,true))
            cell.addView(space(6));cell.addView(text(t("searchSaveLabel")+" #${i+1}",12f,muted))
            cell.setOnClickListener {
                keyword=item.optString("keyword");make=item.optString("make");model=item.optString("model")
                maxPrice=item.optString("maxPrice");yearFrom=item.optString("yearFrom");maxMileage=item.optString("maxMileage")
                fuel=item.optString("fuel");transmission=item.optString("transmission");body=item.optString("body")
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
        content.addView(text(t("searchCountries"),20f,ink,true));content.addView(space(7))
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
        content.addView(btn(t("yourSavedSearch"),false){navigate("searches")})
        body(main,content);navigation(main)
    }

    private fun renderSwipe() {
        root.removeAllViews();root.setBackgroundColor(navy)
        window.setFlags(WindowManager.LayoutParams.FLAG_FULLSCREEN,WindowManager.LayoutParams.FLAG_FULLSCREEN)
        val full=FrameLayout(this)
        root.addView(full,fp())
        val placeholder=image()
        full.addView(placeholder,fp())
        // Native gesture surface. Children with buttons remain independently clickable.
        placeholder.setOnTouchListener(object:View.OnTouchListener {
            var x=0f;var y=0f
            override fun onTouch(v:View,event:MotionEvent):Boolean {
                when(event.actionMasked){
                    MotionEvent.ACTION_DOWN->{x=event.x;y=event.y;return true}
                    MotionEvent.ACTION_UP->{
                        val dx=event.x-x;val dy=event.y-y
                        if(kotlin.math.max(kotlin.math.abs(dx),kotlin.math.abs(dy))<px(52)){
                            openDetails("swipe");return true
                        }
                        if(kotlin.math.abs(dx)>kotlin.math.abs(dy)) {
                            if(dx<0) toast(t("onlyCar")) else openDetails("swipe")
                        } else {
                            if(dy<0)openDetails("swipe")else toast(t("noSimilar"))
                        }
                        return true
                    }
                    MotionEvent.ACTION_CANCEL->return true
                }
                return true
            }
        })
        val shade=View(this).apply {background=gradient()}
        full.addView(shade,fp())
        // The gradient is decorative; all gestures should reach the photo surface.
        shade.isClickable=false
        val top=row()
        top.setPadding(px(16),px(10),px(16),0)
        top.addView(btn("?",false){showSwipeTutorial()},lp(48,48))
        top.addView(View(this),LinearLayout.LayoutParams(0,1,1f))
        top.addView(btn("⌂",false){navigate("home")}.apply{textSize=24f},lp(54,48))
        full.addView(top,fp(-1,-2,Gravity.TOP))
        val overlay=col().apply {setPadding(px(22),0,px(22),px(24))}
        overlay.addView(text(t("demoOnly").uppercase(),11f,orange,true))
        overlay.addView(space(7))
        overlay.addView(text("Nissan GT-R R35 Black Edition",28f,paper,true))
        overlay.addView(space(5))
        overlay.addView(text(euro(68900),27f,paper,true))
        overlay.addView(space(5))
        overlay.addView(text("2013   ·   49.500 km   ·   550 PS   ·   🇭🇷 Zagreb",13f,paper))
        overlay.addView(space(16))
        val buttons=row()
        buttons.addView(btn("ⓘ  "+t("swipeDetails"),false) {openDetails("swipe")},LinearLayout.LayoutParams(0,px(52),1f))
        buttons.addView(spaceHorizontal(10))
        buttons.addView(btn(if(starred)"♥"else"♡",false){setFavorite(!starred);renderSwipe()}.apply{
            textSize=26f;setTextColor(if(starred)orange else ink)
        },lp(64,54))
        overlay.addView(buttons)
        full.addView(overlay,fp(-1,-2,Gravity.BOTTOM))
        if(!swipeSeen)root.post {if(screen=="swipe"&&!swipeSeen)showSwipeTutorial()}
    }
    private fun showSwipeTutorial() {
        val instruction="←  ${t("swipeNext")}\n→  ${t("swipeOpen")}\n↑  ${t("swipeDetails")}\n↓  ${t("swipeSimilar")}"
        AlertDialog.Builder(this).setTitle(t("swipeTeach"))
            .setMessage(instruction)
            .setPositiveButton(t("swipeStart")) { _,_-> swipeSeen=true;prefs.edit().putBoolean("swipeSeen",true).apply() }
            .setNegativeButton(t("backToCar")) { _,_->swipeSeen=true;prefs.edit().putBoolean("swipeSeen",true).apply() }
            .show()
    }

    private fun renderDetails() {
        val main=container();toolbar(main,"NISSAN GT-R",{navigate(backFromDetail)})
        val content=col()
        content.addView(image(280),lp(-1,280))
        val info=col().apply {setPadding(px(19),px(22),px(19),px(25))}
        info.addView(text(t("demoOnly"),11f,orange,true))
        info.addView(space(8))
        info.addView(text("Nissan GT-R R35 Black Edition",26f,ink,true))
        info.addView(space(9));info.addView(text(euro(68900),28f,orange,true))
        info.addView(space(7));info.addView(text("🇭🇷 Zagreb · "+t("conditionUsed"),13f,muted))
        info.addView(space(17))
        val actions=row()
        actions.addView(btn(if(starred)"♥  "+t("saved")else"♡  "+t("saved"),false){setFavorite(!starred);renderDetails()},LinearLayout.LayoutParams(0,px(49),1f))
        actions.addView(spaceHorizontal(9))
        actions.addView(btn("↗ "+t("shareCar"),false){shareWebsite()},LinearLayout.LayoutParams(0,px(49),1f))
        info.addView(actions);info.addView(space(24))
        info.addView(text(t("technicalData"),22f,ink,true));info.addView(space(13))
        val specs=listOf(
            t("make") to "Nissan", t("model") to "GT-R R35",
            t("firstReg") to "2013", t("mileage") to "49.500 km",
            t("power") to "550 PS",t("fuel") to t("petrol"),
            t("transmission") to t("automatic"),t("body") to t("coupe"),
            t("engine") to "3.8 l V6 Biturbo VR38DETT",t("drive") to t("awd"),
            t("color") to t("black"),t("seats") to t("fourSeats")
        )
        specs.forEachIndexed { ix,(k,v)->
            val ln=row(if(ix%2==0)paper else mist)
            ln.setPadding(px(12),px(10),px(12),px(10))
            ln.addView(text(k,13f,muted),LinearLayout.LayoutParams(0,-2,1f))
            ln.addView(text(v,13f,ink,true),LinearLayout.LayoutParams(0,-2,1.25f))
            info.addView(ln)
        }
        info.addView(space(22));info.addView(text(t("vehicleDescription"),22f,ink,true));info.addView(space(10))
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
        val i=Intent(Intent.ACTION_SEND).apply {type="text/plain";putExtra(Intent.EXTRA_TEXT,"Luma Auto · https://raiirajet.github.io/Luma/")}
        startActivity(Intent.createChooser(i,t("shareCar")))
    }
    private fun renderMine() {
        val main=container();toolbar(main,t("myAds"),{navigate("home")})
        val content=col().apply {setPadding(px(19),px(30),px(19),px(30))}
        emptyState(content,t("noOwnCars"));content.addView(space(18))
        content.addView(btn(t("sellCar"),true){showBackendInfo()})
        body(main,content);navigation(main)
    }
    private fun showBackendInfo() {
        AlertDialog.Builder(this).setTitle(t("registerToSell"))
            .setMessage(t("authUnavailable")+"\n\n"+t("demoOnly"))
            .setPositiveButton("OK",null).show()
    }
    override fun onBackPressed() {
        when(screen){
            "details"->navigate(backFromDetail)
            "home"->super.onBackPressed()
            else->navigate("home")
        }
    }
    override fun onKeyDown(keyCode:Int,event:KeyEvent):Boolean {
        if(screen=="swipe"){
            when(keyCode){
                KeyEvent.KEYCODE_DPAD_LEFT,KeyEvent.KEYCODE_DPAD_DOWN->{toast(if(keyCode==KeyEvent.KEYCODE_DPAD_LEFT)t("onlyCar")else t("noSimilar"));return true}
                KeyEvent.KEYCODE_DPAD_UP,KeyEvent.KEYCODE_DPAD_RIGHT->{openDetails("swipe");return true}
            }
        }
        return super.onKeyDown(keyCode,event)
    }
}