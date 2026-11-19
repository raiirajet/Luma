package ch.luma.auto

import android.app.Activity
import android.graphics.BitmapFactory
import android.net.Uri
import com.google.android.gms.tasks.Task
import com.google.firebase.FirebaseApp
import com.google.firebase.FirebaseOptions
import com.google.firebase.Timestamp
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.auth.FirebaseUser
import com.google.firebase.firestore.CollectionReference
import com.google.firebase.firestore.DocumentSnapshot
import com.google.firebase.firestore.FieldValue
import com.google.firebase.firestore.FirebaseFirestore
import com.google.firebase.firestore.ListenerRegistration
import com.google.firebase.firestore.Query
import com.google.firebase.functions.FirebaseFunctions
import com.google.firebase.functions.HttpsCallableResult
import com.google.firebase.storage.FirebaseStorage
import org.json.JSONArray
import org.json.JSONObject
import java.io.ByteArrayOutputStream
import java.net.URI
import java.time.LocalDate

/**
 * Shared Limba production backend, opt-in by supplying assets/firebase-config.json.
 * There are no administrator credentials or hidden passwords in the APK.
 * Demo mode is entirely local when the configuration is absent.
 */
class LimbaFirebase(private val activity: Activity) {
    val auth: FirebaseAuth?
    private val db: FirebaseFirestore?
    private val storage: FirebaseStorage?
    private val functions: FirebaseFunctions?
    private var publicListener: ListenerRegistration? = null
    private var ownListener: ListenerRegistration? = null
    private var favoritesListener: ListenerRegistration? = null
    private var authListener: FirebaseAuth.AuthStateListener? = null
    val ready: Boolean get() = auth != null && db != null && storage != null

    init {
        val config = runCatching {
            JSONObject(activity.assets.open("firebase-config.json").bufferedReader().use { it.readText() })
        }.getOrNull()
        val app = if (config != null
            && config.optString("apiKey").isNotBlank()
            && config.optString("appId").isNotBlank()
            && config.optString("projectId").isNotBlank()) {
            runCatching {
                val opts = FirebaseOptions.Builder()
                    .setApiKey(config.getString("apiKey"))
                    .setApplicationId(config.getString("appId"))
                    .setProjectId(config.getString("projectId"))
                    .apply {
                        if (config.optString("storageBucket").isNotBlank()) {
                            setStorageBucket(config.getString("storageBucket"))
                        }
                    }.build()
                FirebaseApp.getApps(activity).firstOrNull { it.name == "limba" }
                    ?: FirebaseApp.initializeApp(activity.applicationContext, opts, "limba")
            }.getOrNull()
        } else null
        auth = app?.let { FirebaseAuth.getInstance(it) }
        db = app?.let { FirebaseFirestore.getInstance(it) }
        storage = app?.let { FirebaseStorage.getInstance(it) }
        functions = app?.let { FirebaseFunctions.getInstance(it, "europe-west1") }
    }

    fun watchAuth(onChanged: (FirebaseUser?) -> Unit) {
        val service = auth ?: return
        authListener?.let { service.removeAuthStateListener(it) }
        val listener = FirebaseAuth.AuthStateListener { onChanged(it.currentUser) }
        authListener = listener
        service.addAuthStateListener(listener)
    }

    private fun asJson(snapshot: DocumentSnapshot): JSONObject {
        val item = JSONObject()
        item.put("id", snapshot.id)
        for (key in listOf("uid","make","model","modelExtension","title","description","city","country","fuel",
            "transmission","body","condition","accidentStatus","conditionNote","engineName","serviceHistory","modificationNotes","documentNotes","sellerType",
            "contactEmail","image","status")) {
            item.put(key, snapshot.getString(key) ?: "")
        }
        for (key in listOf("year","mileage","power","price")) {
            item.put(key, snapshot.getLong(key) ?: 0)
        }
        snapshot.getLong("engineCapacity")?.let {item.put("engineCapacity",it)}
        for (key in listOf("photoDetails", "batteryReport")) {
            (snapshot.get(key) as? Map<*, *>)?.let { item.put(key, toJsonValue(it)) }
        }
        val images = JSONArray()
        (snapshot.get("images") as? List<*>)?.forEach { images.put(it.toString()) }
        item.put("images", images)
        return item
    }

    private fun toJsonValue(value: Any?): Any = when (value) {
        null -> JSONObject.NULL
        is Timestamp -> value.toDate().time
        is Map<*, *> -> JSONObject().apply {
            for ((key, entry) in value) if (key is String) put(key, toJsonValue(entry))
        }
        is List<*> -> JSONArray().apply { value.forEach { put(toJsonValue(it)) } }
        else -> value
    }

    private fun toFirestoreMap(value: JSONObject): Map<String, Any?> =
        value.keys().asSequence().associateWith { toFirestoreValue(value.get(it)) }

    private fun toFirestoreValue(value: Any): Any? = when (value) {
        JSONObject.NULL -> null
        is JSONObject -> toFirestoreMap(value)
        is JSONArray -> List(value.length()) { toFirestoreValue(value.get(it)) }
        else -> value
    }

    private fun featureDocument(snapshot: DocumentSnapshot): JSONObject =
        (toJsonValue(snapshot.data.orEmpty()) as JSONObject).put("id", snapshot.id)

    fun watchPublic(onChanged: (List<JSONObject>) -> Unit, onError: (String) -> Unit) {
        val service = db ?: return
        publicListener?.remove()
        publicListener = service.collection("listings").whereEqualTo("status","active")
            .limit(300).addSnapshotListener { snapshot, error ->
                if (error != null) { onError(error.localizedMessage ?: "Firestore"); return@addSnapshotListener }
                onChanged(snapshot?.documents?.mapNotNull { runCatching { asJson(it) }.getOrNull() } ?: emptyList())
            }
    }

    fun watchOwned(uid: String?, onChanged: (List<JSONObject>) -> Unit) {
        ownListener?.remove(); ownListener = null
        if (uid.isNullOrBlank() || db == null) { onChanged(emptyList()); return }
        ownListener = db.collection("listings").whereEqualTo("uid",uid)
            .limit(100).addSnapshotListener { snapshot, _ ->
                onChanged(snapshot?.documents?.mapNotNull { runCatching { asJson(it) }.getOrNull() } ?: emptyList())
            }
    }

    fun watchFavorites(uid: String?, onChanged: (Set<String>) -> Unit) {
        favoritesListener?.remove(); favoritesListener = null
        if (uid.isNullOrBlank() || db == null) { onChanged(emptySet()); return }
        favoritesListener = db.collection("users").document(uid).collection("favorites")
            .addSnapshotListener { snapshot, _ ->
                onChanged(snapshot?.documents?.map { it.id }?.toSet() ?: emptySet())
            }
    }

    fun toggleFavorite(id: String, add: Boolean, result: (String?) -> Unit) {
        val uid = auth?.currentUser?.uid ?: return result("Sign in required")
        val ref = db?.collection("users")?.document(uid)?.collection("favorites")?.document(id)
            ?: return result("Firestore unavailable")
        val task = if (add) ref.set(mapOf("createdAt" to FieldValue.serverTimestamp())) else ref.delete()
        task.addOnSuccessListener { result(null) }.addOnFailureListener { result(it.localizedMessage) }
    }

    private fun accountCollection(name: String): CollectionReference? {
        val uid = auth?.currentUser?.uid ?: return null
        return db?.collection("users")?.document(uid)?.collection(name)
    }

    private fun watchQuery(
        query: Query?,
        reverse: Boolean = false,
        done: (List<JSONObject>, String?) -> Unit
    ): ListenerRegistration? {
        val uid = auth?.currentUser?.uid
        if (query == null || uid == null) {
            done(emptyList(), "Sign in required")
            return null
        }
        return query.addSnapshotListener { snapshot, error ->
            if (auth?.currentUser?.uid != uid) return@addSnapshotListener
            val rows = snapshot?.documents.orEmpty().map(::featureDocument)
            done(if (reverse) rows.asReversed() else rows, error?.let { it.localizedMessage ?: "Firestore read failed" })
        }
    }

    private fun isDocumentId(id: String): Boolean = id.isNotBlank() && '/' !in id

    fun fetchListing(id: String, done: (JSONObject?, String?) -> Unit) {
        val service = db ?: return done(null, "Firestore unavailable")
        if (!isDocumentId(id)) return done(null, "Listing unavailable")
        val uid = auth?.currentUser?.uid
        service.collection("listings").document(id).get()
            .addOnSuccessListener { snapshot ->
                if (auth?.currentUser?.uid == uid) {
                    if (snapshot.exists()) done(asJson(snapshot), null)
                    else done(null, "Listing unavailable")
                }
            }.addOnFailureListener { error ->
                if (auth?.currentUser?.uid == uid) done(null, error.localizedMessage ?: "Listing unavailable")
            }
    }

    fun watchThreads(done: (List<JSONObject>, String?) -> Unit): ListenerRegistration? {
        val uid = auth?.currentUser?.uid
        val query = uid?.let {
            db?.collection("chatThreads")?.whereArrayContains("participants", it)
                ?.orderBy("updatedAt", Query.Direction.DESCENDING)?.limit(50)
        }
        return watchQuery(query, done = done)
    }

    fun watchThread(threadId: String, done: (JSONObject?, String?) -> Unit): ListenerRegistration? {
        val uid = auth?.currentUser?.uid
        val service = db
        if (!isDocumentId(threadId) || uid == null || service == null) {
            done(null, "Conversation unavailable")
            return null
        }
        return service.collection("chatThreads").document(threadId).addSnapshotListener { snapshot, error ->
            if (auth?.currentUser?.uid != uid) return@addSnapshotListener
            if (snapshot?.exists() == true) done(featureDocument(snapshot), null)
            else done(null, error?.localizedMessage ?: "Conversation unavailable")
        }
    }

    fun watchMessages(threadId: String, done: (List<JSONObject>, String?) -> Unit): ListenerRegistration? {
        if (!isDocumentId(threadId)) {
            done(emptyList(), "Conversation unavailable")
            return null
        }
        val query = db?.collection("chatThreads")?.document(threadId)?.collection("messages")
            ?.orderBy("createdAt", Query.Direction.DESCENDING)?.limit(100)
        return watchQuery(query, reverse = true, done = done)
    }

    fun watchNotifications(done: (List<JSONObject>, String?) -> Unit): ListenerRegistration? =
        watchQuery(accountCollection("notifications")?.orderBy("createdAt", Query.Direction.DESCENDING)?.limit(100), done = done)

    fun watchSavedSearchAlerts(done: (List<JSONObject>, String?) -> Unit): ListenerRegistration? =
        watchQuery(accountCollection("searchAlerts")?.limit(20), done = done)

    fun watchSavedSearches(uid: String, done: (List<JSONObject>, String?) -> Unit): ListenerRegistration? {
        if (auth?.currentUser?.uid != uid) {
            done(emptyList(), "Sign in required")
            return null
        }
        val searches = accountCollection("data")?.document("searches")
        if (searches == null) {
            done(emptyList(), "Firestore unavailable")
            return null
        }
        return searches.addSnapshotListener { snapshot, error ->
            if (auth?.currentUser?.uid != uid) return@addSnapshotListener
            val items = (snapshot?.get("items") as? List<*>).orEmpty()
                .filterIsInstance<Map<*, *>>().map { toJsonValue(it) as JSONObject }
            done(items, error?.let { it.localizedMessage ?: "Firestore read failed" })
        }
    }

    /** Account-wide search countries, shared with the Limba website. */
    fun watchCountries(uid: String, done: (Set<String>, Boolean, String?) -> Unit): ListenerRegistration? {
        if (auth?.currentUser?.uid != uid) {
            done(emptySet(), false, "Sign in required")
            return null
        }
        val reference = db?.collection("users")?.document(uid)?.collection("data")?.document("preferences")
        if (reference == null) {
            done(emptySet(), false, "Firestore unavailable")
            return null
        }
        return reference.addSnapshotListener { snapshot, error ->
            if (auth?.currentUser?.uid != uid) return@addSnapshotListener
            if (error != null) {
                done(emptySet(), false, error.localizedMessage ?: "Could not load preferences")
                return@addSnapshotListener
            }
            val allowed = setOf("AL","TR","GR","RS","SI","XK","MK","HR","BA","ME","BG","RO")
            val selected = (snapshot?.get("countries") as? List<*>).orEmpty()
                .filterIsInstance<String>().filter { it in allowed }.toSet()
            done(selected, snapshot?.exists() == true, null)
        }
    }

    fun saveCountries(countries: Set<String>, done: (String?) -> Unit) {
        val uid = auth?.currentUser?.uid ?: return done("Sign in required")
        val allowed = setOf("AL","TR","GR","RS","SI","XK","MK","HR","BA","ME","BG","RO")
        val reference = db?.collection("users")?.document(uid)?.collection("data")?.document("preferences")
            ?: return done("Firestore unavailable")
        val values = countries.filter { it in allowed }.sorted()
        reference.set(mapOf("countries" to values)).addOnSuccessListener { done(null) }
            .addOnFailureListener { done(it.localizedMessage ?: "Could not save preferences") }
    }

    private data class SavedSearchKey(val name: String, val filters: Map<String, String>, val countries: Set<String>)

    private fun savedSearchKey(item: Map<*, *>): SavedSearchKey {
        val filters = (item["filters"] as? Map<*, *>).orEmpty().entries.mapNotNull { (key, value) ->
            val field = key as? String ?: return@mapNotNull null
            val filter = (value as? String)?.trim()?.takeIf { it.isNotEmpty() } ?: return@mapNotNull null
            field to filter
        }.toMap()
        val countries = (item["countries"] as? List<*>).orEmpty().filterIsInstance<String>().toSet()
        return SavedSearchKey((item["name"] as? String).orEmpty().trim(), filters, countries)
    }

    fun sameSavedSearch(first: JSONObject, second: JSONObject): Boolean =
        savedSearchKey(toFirestoreMap(first)) == savedSearchKey(toFirestoreMap(second))

    fun saveSearch(item: JSONObject, done: (String?) -> Unit) {
        val searches = accountCollection("data")?.document("searches") ?: return done("Sign in required")
        val saved = toFirestoreMap(item)
        val key = savedSearchKey(saved)
        finish(searches.firestore.runTransaction { transaction ->
            val existing = (transaction.get(searches).get("items") as? List<*>).orEmpty().filterIsInstance<Map<*, *>>()
            val remaining = existing.distinctBy(::savedSearchKey).filterNot { savedSearchKey(it) == key }
            check(remaining.size < 20) { "Saved search limit reached" }
            val items = listOf(saved) + remaining
            if (items != existing) transaction.set(searches, mapOf("items" to items))
            Unit
        }, done)
    }

    fun listPriceHistory(listingId: String, done: (List<JSONObject>, String?) -> Unit) {
        val service = db ?: return done(emptyList(), "Firestore unavailable")
        if (!isDocumentId(listingId)) return done(emptyList(), "Listing unavailable")
        val uid = auth?.currentUser?.uid
        service.collection("listings").document(listingId).collection("priceHistory")
            .orderBy("changedAt", Query.Direction.DESCENDING).limit(50).get()
            .addOnSuccessListener { snapshot ->
                if (auth?.currentUser?.uid == uid) done(snapshot.documents.map(::featureDocument), null)
            }.addOnFailureListener { error ->
                if (auth?.currentUser?.uid == uid) done(emptyList(), error.localizedMessage ?: "Firestore read failed")
            }
    }

    fun markNotificationRead(notificationId: String, done: (String?) -> Unit) {
        if (!isDocumentId(notificationId)) return done("Notification unavailable")
        val ref = accountCollection("notifications")?.document(notificationId) ?: return done("Sign in required")
        finish(ref.update("read", true), done)
    }

    private fun finish(task: Task<*>, done: (String?) -> Unit) {
        task.addOnSuccessListener { done(null) }
            .addOnFailureListener { done(it.localizedMessage ?: "Firebase request failed") }
    }

    private fun callFeature(name: String, data: Map<String, Any>): Task<HttpsCallableResult>? =
        functions?.getHttpsCallable(name)?.call(data)

    private fun callFeature(name: String, data: Map<String, Any>, done: (String?) -> Unit) {
        if (auth?.currentUser == null) return done("Sign in required")
        finish(callFeature(name, data) ?: return done("Firebase unavailable"), done)
    }

    fun startListingChat(listingId: String, done: (String?, String?) -> Unit) {
        val uid = auth?.currentUser?.uid ?: return done(null, "Sign in required")
        val task = callFeature("startListingChat", mapOf("listingId" to listingId))
            ?: return done(null, "Firebase unavailable")
        task.addOnSuccessListener { result ->
            if (auth?.currentUser?.uid != uid) return@addOnSuccessListener
            val id = (result.data as? Map<*, *>)?.get("threadId") as? String
            if (id == null || !isDocumentId(id)) done(null, "Conversation unavailable") else done(id, null)
        }.addOnFailureListener { error ->
            if (auth?.currentUser?.uid == uid) done(null, error.localizedMessage ?: "Firebase request failed")
        }
    }

    fun sendListingMessage(threadId: String, text: String, messageId: String, done: (String?) -> Unit) =
        callFeature("sendListingMessage", mapOf("threadId" to threadId, "text" to text, "messageId" to messageId), done)

    fun setListingChatBlocked(threadId: String, blocked: Boolean, done: (String?) -> Unit) =
        callFeature("setListingChatBlocked", mapOf("threadId" to threadId, "blocked" to blocked), done)

    fun reportListingChat(threadId: String, reason: String, done: (String?) -> Unit) =
        callFeature("reportListingChat", mapOf("threadId" to threadId, "reason" to reason), done)

    fun setSavedSearchAlert(name: String, filters: JSONObject, countries: List<String>, enabled: Boolean, done: (String?) -> Unit) =
        callFeature("setSavedSearchAlert", mapOf(
            "name" to name, "filters" to toFirestoreMap(filters), "countries" to countries, "enabled" to enabled
        ), done)

    fun signIn(email: String, password: String, done: (String?) -> Unit) {
        val a = auth ?: return done("Firebase not configured")
        a.signInWithEmailAndPassword(email, password).addOnSuccessListener { done(null) }
            .addOnFailureListener { done(it.localizedMessage ?: "Login failed") }
    }

    fun register(email: String, password: String, done: (String?) -> Unit) {
        val a = auth ?: return done("Firebase not configured")
        a.createUserWithEmailAndPassword(email,password).addOnSuccessListener {
            it.user?.sendEmailVerification()?.addOnSuccessListener { done(null) }
                ?.addOnFailureListener { err -> done(err.localizedMessage ?: "Email failed") }
                ?: done("Missing user")
        }.addOnFailureListener { done(it.localizedMessage ?: "Registration failed") }
    }

    fun refreshVerification(done: (Boolean) -> Unit) {
        val user = auth?.currentUser ?: return done(false)
        user.reload().addOnCompleteListener {
            user.getIdToken(true).addOnCompleteListener { done(user.isEmailVerified) }
        }
    }

    fun sendVerification(done: (String?) -> Unit) {
        val user = auth?.currentUser ?: return done("Sign in required")
        user.sendEmailVerification().addOnSuccessListener { done(null) }
            .addOnFailureListener { done(it.localizedMessage) }
    }

    fun resetPassword(email: String, done: (String?) -> Unit) {
        auth?.sendPasswordResetEmail(email)?.addOnSuccessListener { done(null) }
            ?.addOnFailureListener { done(it.localizedMessage) } ?: done("Firebase not configured")
    }

    private fun photoDetails(input: JSONObject, photoCount: Int): Map<String, Map<String, String>> =
        input.keys().asSequence().associateWith { slot ->
            require(slot.length == 1 && slot[0] - '0' in 0 until photoCount.coerceAtMost(6)) { "Invalid photo position" }
            val detail = input.getJSONObject(slot)
            val kind = detail.getString("kind")
            val note = detail.optString("note").trim()
            require(kind in setOf("exterior", "interior", "odometer", "damage", "other") && note.length <= 160) {
                "Invalid photo details"
            }
            mapOf("kind" to kind, "note" to note)
        }

    private fun batteryReport(input: JSONObject): Map<String, Any> {
        val health = input.optDouble("health")
        val measuredAt = input.optString("measuredAt").trim()
        val issuer = input.optString("issuer").trim()
        val url = input.optString("url").trim()
        require(health in 0.0..100.0 && measuredAt.length == 10 &&
            runCatching { LocalDate.parse(measuredAt) }.isSuccess && issuer.length in 1..120) {
            "Invalid battery report"
        }
        return mutableMapOf<String, Any>("health" to health, "measuredAt" to measuredAt, "issuer" to issuer).apply {
            if (url.isNotEmpty()) {
                val uri = runCatching { URI(url) }.getOrNull()
                require(url.length <= 500 && uri?.scheme == "https" && !uri.host.isNullOrBlank() && uri.userInfo == null) {
                    "Invalid battery report link"
                }
                put("url", url)
            }
        }
    }

    private fun data(car: JSONObject, editing: Boolean, photoCount: Int): MutableMap<String, Any> {
        val fields = mutableMapOf<String,Any>()
        for (key in listOf("make","model","description","city","country","fuel","transmission",
            "body","condition","accidentStatus","conditionNote","sellerType")) {
            fields[key] = car.optString(key)
        }
        val motor=car.optString("engineName").trim().take(80)
        if(motor.isNotBlank())fields["engineName"]=motor
        else if(car.optBoolean("clearEngineName"))fields["engineName"]=FieldValue.delete()
        if(car.has("engineCapacity")&&!car.isNull("engineCapacity"))fields["engineCapacity"]=car.optInt("engineCapacity")
        else if(car.optBoolean("clearEngineCapacity"))fields["engineCapacity"]=FieldValue.delete()
        // Optional vehicle-passport seller statements, limited by Firestore validation.
        for ((field,limit) in listOf("serviceHistory" to 500, "modificationNotes" to 500, "documentNotes" to 240)) {
            val value = car.optString(field).trim().take(limit)
            if (value.isNotBlank()) fields[field] = value
            else if (car.optBoolean("clear" + field.replaceFirstChar { it.uppercase() }))
                fields[field] = FieldValue.delete()
        }
        // Preserve compatibility with current production rules until the optional field is deployed.
        val modelExtension = car.optString("modelExtension")
        if (modelExtension.isNotBlank()) fields["modelExtension"] = modelExtension
        else if (car.optBoolean("clearModelExtension")) fields["modelExtension"] = FieldValue.delete()
        // Public listing documents never contain seller PII.
        fields["contactEmail"] = ""
        fields["title"] = listOf(car.optString("make"),car.optString("model"),car.optString("modelExtension")).filter{it.isNotBlank()}.joinToString(" ")
        fields["category"] = "vehicles"
        for (key in listOf("year","mileage","power","price")) fields[key] = car.optInt(key)
        if (car.has("photoDetails")) {
            val photos = if (car.isNull("photoDetails")) null else car.getJSONObject("photoDetails")
            if (photos != null && photos.length() > 0) fields["photoDetails"] = photoDetails(photos, photoCount)
            else if (editing) fields["photoDetails"] = FieldValue.delete()
        }
        if (car.has("batteryReport")) {
            val report = if (car.isNull("batteryReport")) null else car.getJSONObject("batteryReport")
            if (report != null && report.length() > 0) fields["batteryReport"] = batteryReport(report)
            else if (editing) fields["batteryReport"] = FieldValue.delete()
        }
        return fields
    }

    // Photo files are converted to JPEG and constrained to 1600px before upload.
    private fun compress(uri: Uri): ByteArray {
        val resolver = activity.contentResolver
        val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
        resolver.openInputStream(uri).use { BitmapFactory.decodeStream(it,null,bounds) }
        var sample = 1
        while (bounds.outWidth / sample > 1600 || bounds.outHeight / sample > 1600) sample *= 2
        val opts = BitmapFactory.Options().apply { inSampleSize = sample }
        val image = resolver.openInputStream(uri).use { BitmapFactory.decodeStream(it,null,opts) }
            ?: throw IllegalArgumentException("Invalid image")
        val out = ByteArrayOutputStream()
        image.compress(android.graphics.Bitmap.CompressFormat.JPEG, 82, out)
        image.recycle()
        return out.toByteArray().also { require(it.size in 1 until 5*1024*1024) }
    }

    fun publish(car: JSONObject, selected: List<Uri>, done: (String?) -> Unit) {
        val user = auth?.currentUser ?: return done("Sign in required")
        if (!user.isEmailVerified) return done("Verify your email first")
        if (selected.isEmpty() || selected.size > 6) return done("Select 1 to 6 photos")
        val service = db ?: return done("Firestore unavailable")
        val store = storage ?: return done("Storage unavailable")
        val fields = runCatching { data(car, editing = false, photoCount = selected.size) }
            .getOrElse { return done(it.localizedMessage ?: "Invalid vehicle data") }
        val document = service.collection("listings").document()
        val uploaded = mutableListOf<com.google.firebase.storage.StorageReference>()
        val urls = mutableListOf<String>()
        fun failure(message: String) {
            uploaded.forEach { it.delete() } // Best-effort rollback; monitor orphan files separately.
            done(message)
        }
        fun uploadAt(index: Int) {
            if (index == selected.size) {
                fields["uid"] = user.uid
                fields["status"] = "active"
                fields["createdAt"] = FieldValue.serverTimestamp()
                fields["images"] = urls.toList()
                fields["image"] = urls.first()
                document.set(fields).addOnSuccessListener { done(null) }
                    .addOnFailureListener { failure(it.localizedMessage ?: "Firestore write failed") }
                return
            }
            Thread {
                val photo = runCatching { compress(selected[index]) }
                activity.runOnUiThread {
                    if (photo.isFailure) {
                        failure(photo.exceptionOrNull()?.localizedMessage ?: "Invalid photo")
                    } else {
                        val ref = store.reference.child("listings/${user.uid}/${document.id}/${index}.jpg")
                        ref.putBytes(photo.getOrThrow(),
                            com.google.firebase.storage.StorageMetadata.Builder()
                                .setContentType("image/jpeg").build())
                            .addOnSuccessListener {
                                uploaded.add(ref)
                                ref.downloadUrl.addOnSuccessListener { uri ->
                                    urls.add(uri.toString()); uploadAt(index+1)
                                }.addOnFailureListener { failure(it.localizedMessage ?: "URL unavailable") }
                            }.addOnFailureListener { failure(it.localizedMessage ?: "Upload failed") }
                    }
                }
            }.start()
        }
        uploadAt(0)
    }

    fun update(car: JSONObject, done: (String?) -> Unit) {
        val user = auth?.currentUser ?: return done("Sign in required")
        if (car.optString("uid") != user.uid) return done("Not your listing")
        val photoCount = car.optJSONArray("images")?.length() ?: 6
        val fields = runCatching { data(car, editing = true, photoCount = photoCount) }
            .getOrElse { return done(it.localizedMessage ?: "Invalid vehicle data") }
        db?.collection("listings")?.document(car.optString("id"))?.update(fields)
            ?.addOnSuccessListener { done(null) }
            ?.addOnFailureListener { done(it.localizedMessage) } ?: done("Firestore unavailable")
    }

    fun status(car: JSONObject, value: String, done: (String?) -> Unit) {
        val user = auth?.currentUser ?: return done("Sign in required")
        if (car.optString("uid") != user.uid || value !in listOf("active","sold","paused")) {
            return done("Invalid status")
        }
        db?.collection("listings")?.document(car.optString("id"))?.update("status",value)
            ?.addOnSuccessListener { done(null) }
            ?.addOnFailureListener { done(it.localizedMessage) } ?: done("Firestore unavailable")
    }

    fun remove(car: JSONObject, done: (String?) -> Unit) {
        val user = auth?.currentUser ?: return done("Sign in required")
        if (car.optString("uid") != user.uid) return done("Not your listing")
        val images = car.optJSONArray("images")
        db?.collection("listings")?.document(car.optString("id"))?.delete()
            ?.addOnSuccessListener {
                if (images != null && storage != null) {
                    for (i in 0 until images.length()) {
                        runCatching { storage?.getReferenceFromUrl(images.optString(i))?.delete() }
                    }
                }
                done(null)
            }?.addOnFailureListener { done(it.localizedMessage) } ?: done("Firestore unavailable")
    }

    fun report(listingId: String, reason: String, done: (String?) -> Unit) {
        val user = auth?.currentUser ?: return done("Sign in required")
        if (!user.isEmailVerified) return done("Verify your email first")
        val reportId = "${user.uid}_$listingId"
        db?.collection("reports")?.document(reportId)?.set(mapOf(
            "listingId" to listingId,
            "reporterUid" to user.uid,
            "reason" to reason,
            "createdAt" to FieldValue.serverTimestamp()))
            ?.addOnSuccessListener { done(null) }
            ?.addOnFailureListener { done(it.localizedMessage) } ?: done("Firestore unavailable")
    }

    fun close() {
        publicListener?.remove(); ownListener?.remove(); favoritesListener?.remove()
        authListener?.let { listener -> auth?.removeAuthStateListener(listener) }
    }
}
