package ch.luma.auto

import android.app.Activity
import android.graphics.BitmapFactory
import android.net.Uri
import android.util.Base64
import com.google.android.gms.tasks.Task
import com.google.firebase.Timestamp
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.auth.FirebaseUser
import com.google.firebase.firestore.CollectionReference
import com.google.firebase.firestore.DocumentSnapshot
import com.google.firebase.firestore.FieldPath
import com.google.firebase.firestore.FieldValue
import com.google.firebase.firestore.FirebaseFirestore
import com.google.firebase.firestore.ListenerRegistration
import com.google.firebase.firestore.Query
import com.google.firebase.firestore.Source
import com.google.firebase.functions.FirebaseFunctions
import com.google.firebase.functions.HttpsCallableResult
import com.google.firebase.firestore.FirebaseFirestoreException
import com.google.firebase.storage.FirebaseStorage
import org.json.JSONArray
import org.json.JSONObject
import java.io.ByteArrayOutputStream
import java.net.URI
import java.time.LocalDate
import java.util.concurrent.TimeUnit

data class LimbaRadius(val placeId: String, val km: Int) {
    fun request() = mapOf("placeId" to placeId, "km" to km)
}

data class LimbaPlace(val id: String, val name: String, val country: String, val region: String)
data class LimbaSearchPage(val items: List<JSONObject>, val nextCursor: String?)
data class LimbaDealerProfile(
    val uid: String, val companyName: String, val country: String, val city: String,
    val website: String, val published: Boolean
)
data class LimbaDealerStatistics(val views: Int, val inquiries: Int, val days: Int)

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
    private val secureFunctions: FirebaseFunctions?
    private var publicListener: ListenerRegistration? = null
    private var ownListener: ListenerRegistration? = null
    private var favoritesListener: ListenerRegistration? = null
    private var authListener: FirebaseAuth.AuthStateListener? = null
    val ready: Boolean get() = auth != null && db != null && storage != null

    init {
        val app = limbaFirebaseApp(activity)
        auth = app?.let { FirebaseAuth.getInstance(it) }
        db = app?.let { FirebaseFirestore.getInstance(it) }
        storage = app?.let { FirebaseStorage.getInstance(it) }
        functions = app?.let { FirebaseFunctions.getInstance(it, "europe-west1") }
        secureFunctions = app?.let { FirebaseFunctions.getInstance(it, "europe-west6") }
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
            "contactEmail","image","status","placeId","customsStatus","customsCountry")) {
            item.put(key, snapshot.getString(key) ?: "")
        }
        for (key in listOf("year","mileage","power","price")) {
            item.put(key, snapshot.getLong(key) ?: 0)
        }
        snapshot.getLong("engineCapacity")?.let {item.put("engineCapacity",it)}
        snapshot.getTimestamp("createdAt")?.let { item.put("createdAt", it.toDate().time) }
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

    fun fetchListing(id: String, done: (JSONObject?, String?) -> Unit) = fetchListing(id, Source.DEFAULT, done)

    fun fetchServerListing(id: String, done: (JSONObject?, String?) -> Unit) = fetchListing(id, Source.SERVER, done)

    private fun fetchListing(id: String, source: Source, done: (JSONObject?, String?) -> Unit) {
        val service = db ?: return done(null, "Firestore unavailable")
        if (!isDocumentId(id)) return done(null, "Listing unavailable")
        val uid = auth?.currentUser?.uid
        service.collection("listings").document(id).get(source)
            .addOnSuccessListener { snapshot ->
                if (auth?.currentUser?.uid == uid) {
                    if (snapshot.exists()) done(asJson(snapshot), null)
                    else done(null, "Listing unavailable")
                }
            }.addOnFailureListener { error ->
                if (auth?.currentUser?.uid == uid) done(null, error.localizedMessage ?: "Listing unavailable")
            }
    }

    fun checkThreadAccess(threadId: String, done: (Boolean) -> Unit) {
        val uid = auth?.currentUser?.uid ?: return done(false)
        val service = db?.takeIf { isDocumentId(threadId) } ?: return done(false)
        service.collection("chatThreads").document(threadId).get(Source.SERVER)
            .addOnSuccessListener { snapshot ->
                val participants = snapshot.get("participants") as? List<*>
                done(uid == auth?.currentUser?.uid && participants?.contains(uid) == true)
            }.addOnFailureListener { done(false) }
    }

    fun getSearchEnabled(onResult: (Boolean) -> Unit) {
        val ref = db?.collection("marketplaceRelease")?.document("v1_9") ?: return onResult(false)
        ref.get(Source.SERVER).addOnCompleteListener { task ->
            onResult(task.isSuccessful && task.result.getBoolean("searchEnabled") == true)
        }
    }

    private fun marketplaceObject(
        name: String, data: Map<String, Any>, done: (Result<JSONObject>) -> Unit
    ) {
        val task = callMarketplace(name, data)
            ?: return done(Result.failure(IllegalStateException("Marketplace unavailable")))
        task.addOnSuccessListener { done(runCatching { toJsonValue(it.data) as JSONObject }) }
            .addOnFailureListener { done(Result.failure(it)) }
    }

    fun searchListings(
        filters: Map<String, String>, countries: Set<String>, sort: String, radius: LimbaRadius?,
        cursor: String?, onResult: (Result<LimbaSearchPage>) -> Unit
    ) {
        val data = mutableMapOf<String, Any>("filters" to filters, "countries" to countries.sorted(), "sort" to sort)
        radius?.let { data["radius"] = it.request() }
        cursor?.let { data["cursor"] = it }
        marketplaceObject("searchListings", data) { result -> onResult(result.mapCatching { payload ->
            val items = payload.getJSONArray("items")
            LimbaSearchPage(List(items.length()) { items.getJSONObject(it) },
                payload.optString("nextCursor").takeUnless { it.isBlank() || payload.isNull("nextCursor") })
        }) }
    }

    fun lookupListingPlaces(query: String, country: String?, onResult: (Result<List<LimbaPlace>>) -> Unit) {
        val data = mutableMapOf("query" to query)
        country?.takeIf { it.isNotBlank() }?.let { data["country"] = it }
        marketplaceObject("lookupListingPlaces", data) { result -> onResult(result.mapCatching { payload ->
            val places = payload.getJSONArray("places")
            List(places.length()) { index -> places.getJSONObject(index).let {
                LimbaPlace(it.getString("id"), it.getString("name"), it.getString("country"), it.optString("region"))
            } }
        }) }
    }

    fun getDealerProfile(uid: String, onResult: (Result<LimbaDealerProfile?>) -> Unit) {
        val ref = db?.takeIf { isDocumentId(uid) }?.collection("dealerProfiles")?.document(uid)
            ?: return onResult(Result.failure(IllegalArgumentException("Dealer profile unavailable")))
        ref.get(Source.SERVER).addOnSuccessListener { snapshot ->
            onResult(Result.success(if (!snapshot.exists()) null else LimbaDealerProfile(
                uid, snapshot.getString("companyName").orEmpty(), snapshot.getString("country").orEmpty(),
                snapshot.getString("city").orEmpty(), snapshot.getString("website").orEmpty(),
                snapshot.getBoolean("published") == true
            )))
        }.addOnFailureListener { error ->
            if (error is FirebaseFirestoreException && error.code == FirebaseFirestoreException.Code.PERMISSION_DENIED)
                onResult(Result.success(null))
            else onResult(Result.failure(error))
        }
    }

    fun saveDealerProfile(profile: LimbaDealerProfile, onResult: (Result<Unit>) -> Unit) {
        val user = auth?.currentUser
        val ref = db?.takeIf { user != null && user.uid == profile.uid && user.isEmailVerified }
            ?.collection("dealerProfiles")?.document(profile.uid)
            ?: return onResult(Result.failure(IllegalStateException("Verify your email first")))
        ref.set(mapOf(
            "companyName" to profile.companyName, "country" to profile.country, "city" to profile.city.trim(),
            "website" to profile.website.trim(), "published" to profile.published, "updatedAt" to FieldValue.serverTimestamp()
        )).addOnSuccessListener { onResult(Result.success(Unit)) }
            .addOnFailureListener { onResult(Result.failure(it)) }
    }

    fun getDealerStock(uid: String, cursor: String?, onResult: (Result<LimbaSearchPage>) -> Unit) {
        val service = db ?: return onResult(Result.failure(IllegalStateException("Firestore unavailable")))
        var query: Query = service.collection("listings").whereEqualTo("uid", uid)
            .whereEqualTo("status", "active").whereEqualTo("sellerType", "dealer").orderBy(FieldPath.documentId())
        if (cursor != null) query = query.startAfter(cursor)
        query.limit(25).get(Source.SERVER).addOnSuccessListener { snapshot ->
            val items = snapshot.documents.take(24)
            onResult(Result.success(LimbaSearchPage(items.map(::asJson),
                if (snapshot.size() > items.size) items.last().id else null)))
        }.addOnFailureListener { onResult(Result.failure(it)) }
    }

    fun getDealerStatistics(days: Int, onResult: (Result<LimbaDealerStatistics>) -> Unit) {
        val uid = auth?.currentUser?.uid
        marketplaceObject("getDealerStatistics", mapOf("days" to days)) { result ->
            if (uid == auth?.currentUser?.uid) onResult(result.mapCatching {
                LimbaDealerStatistics(it.getInt("views"), it.getInt("inquiries"), it.getInt("days"))
            })
        }
    }

    fun recordDealerListingView(id: String) {
        if (auth?.currentUser?.isEmailVerified == true && isDocumentId(id)) {
            callMarketplace("recordDealerListingView", mapOf("listingId" to id))
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

    private data class SavedSearchKey(
        val name: String, val filters: Map<String, String>, val countries: Set<String>, val radius: LimbaRadius?
    )

    private fun savedSearchKey(item: Map<*, *>): SavedSearchKey {
        val filters = (item["filters"] as? Map<*, *>).orEmpty().entries.mapNotNull { (key, value) ->
            val field = key as? String ?: return@mapNotNull null
            val filter = (value as? String)?.trim()?.takeIf { it.isNotEmpty() } ?: return@mapNotNull null
            field to filter
        }.toMap()
        val countries = (item["countries"] as? List<*>).orEmpty().filterIsInstance<String>().toSet()
        val radius = (item["radius"] as? Map<*, *>)?.let {
            val placeId = it["placeId"] as? String ?: return@let null
            val km = (it["km"] as? Number)?.toInt() ?: return@let null
            LimbaRadius(placeId, km)
        }
        return SavedSearchKey((item["name"] as? String).orEmpty().trim(), filters, countries, radius)
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

    fun setSavedSearchAlert(
        name: String, filters: JSONObject, countries: List<String>, enabled: Boolean,
        radius: LimbaRadius? = null, done: (String?) -> Unit
    ) {
        val data = mutableMapOf<String, Any>(
            "name" to name, "filters" to toFirestoreMap(filters), "countries" to countries, "enabled" to enabled
        )
        radius?.let { data["radius"] = it.request() }
        callFeature("setSavedSearchAlert", data, done)
    }

    fun signIn(email: String, password: String, done: (String?) -> Unit) {
        val a = auth ?: return done("Firebase not configured")
        a.signInWithEmailAndPassword(email, password).addOnSuccessListener { done(null) }
            .addOnFailureListener { done(it.localizedMessage ?: "Login failed") }
    }

    fun register(email: String, password: String, dealerName: String?, done: (String?) -> Unit) {
        val service = auth ?: return done("Firebase not configured")
        service.createUserWithEmailAndPassword(email, password).addOnSuccessListener { credential ->
            val user = credential.user ?: return@addOnSuccessListener done("Missing user")
            fun sendVerification(applicationError: String?) {
                user.sendEmailVerification().addOnSuccessListener { done(applicationError) }
                    .addOnFailureListener { done(it.localizedMessage ?: "Email failed") }
            }
            if (dealerName == null) sendVerification(null)
            else saveDealerApplication(dealerName, ::sendVerification)
        }.addOnFailureListener { done(it.localizedMessage ?: "Registration failed") }
    }

    fun watchDealerApplication(done: (JSONObject?, String?) -> Unit): ListenerRegistration? {
        val uid = auth?.currentUser?.uid ?: return null
        return db?.collection("dealerApplications")?.document(uid)?.addSnapshotListener { snapshot, error ->
            if (auth?.currentUser?.uid != uid || snapshot?.metadata?.hasPendingWrites() == true) return@addSnapshotListener
            done(snapshot?.takeIf { it.exists() }?.let(::featureDocument), error?.localizedMessage)
        }
    }

    fun saveDealerApplication(companyName: String, done: (String?) -> Unit) {
        val user = auth?.currentUser ?: return done("Sign in required")
        val service = db ?: return done("Firestore unavailable")
        val reference = service.collection("dealerApplications").document(user.uid)
        val task = service.runTransaction { transaction ->
            val existing = transaction.get(reference)
            val data = mutableMapOf<String, Any>(
                "companyName" to companyName.trim(),
                "email" to user.email.orEmpty(),
                "status" to if (user.isEmailVerified) "pending" else "verificationRequired",
                "reviewerUid" to "",
                "updatedAt" to FieldValue.serverTimestamp(),
            )
            if (existing.exists()) transaction.update(reference, data)
            else {
                data["createdAt"] = FieldValue.serverTimestamp()
                transaction.set(reference, data)
            }
            Unit
        }
        finish(task, done)
    }

    fun submitVerifiedDealerApplication(done: (String?) -> Unit) {
        val user = auth?.currentUser ?: return done("Sign in required")
        val reference = db?.collection("dealerApplications")?.document(user.uid) ?: return done("Firestore unavailable")
        if (!user.isEmailVerified) return done("Verify your email first")
        user.getIdToken(true).addOnSuccessListener {
            finish(reference.update(mapOf(
                "email" to user.email.orEmpty(),
                "status" to "pending",
                "updatedAt" to FieldValue.serverTimestamp(),
            )), done)
        }.addOnFailureListener { done(it.localizedMessage ?: "Firebase request failed") }
    }

    fun mayReviewDealers(done: (Boolean) -> Unit) {
        val user = auth?.currentUser ?: return done(false)
        if (!user.isEmailVerified) return done(false)
        user.getIdToken(true).addOnSuccessListener { result ->
            done(auth?.currentUser?.uid == user.uid && result.claims["limbaAdmin"] == true)
        }.addOnFailureListener { done(false) }
    }

    fun pendingDealers(done: (List<JSONObject>, String?) -> Unit) {
        val uid = auth?.currentUser?.uid ?: return done(emptyList(), "Sign in required")
        val applications = db?.collection("dealerApplications") ?: return done(emptyList(), "Firestore unavailable")
        applications.whereEqualTo("status", "pending").limit(50).get(Source.SERVER).addOnSuccessListener { snapshot ->
            if (auth?.currentUser?.uid == uid) done(snapshot.documents.map(::featureDocument), null)
        }.addOnFailureListener { done(emptyList(), it.localizedMessage ?: "Firebase request failed") }
    }

    fun reviewDealer(uid: String, approved: Boolean, done: (String?) -> Unit) {
        val reviewer = auth?.currentUser?.uid ?: return done("Sign in required")
        if (!isDocumentId(uid)) return done("Invalid account")
        val applicant = db?.collection("dealerApplications")?.document(uid) ?: return done("Firestore unavailable")
        finish(applicant.update(mapOf(
            "status" to if (approved) "approved" else "rejected",
            "reviewerUid" to reviewer,
            "updatedAt" to FieldValue.serverTimestamp(),
        )), done)
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
        if (car.has("placeId")) {
            val placeId = car.optString("placeId")
            if (placeId.isNotEmpty()) fields["placeId"] = placeId
            else if (editing) fields["placeId"] = FieldValue.delete()
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

    private fun withMarketplaceMode(
        done: (String?) -> Unit,
        action: (Boolean) -> Unit
    ) {
        val config = db?.collection("marketplaceSecurity")?.document("enforcement")
            ?: return done("Firestore unavailable")
        config.get(Source.SERVER).addOnSuccessListener {
            action(it.getBoolean("pipelineEnabled") == true || it.getBoolean("requirePipeline") == true)
        }.addOnFailureListener {
            // A client can update before the corresponding rules are deployed.
            if (it is FirebaseFirestoreException && it.code == FirebaseFirestoreException.Code.PERMISSION_DENIED) {
                action(false)
            } else done(it.localizedMessage ?: "Marketplace unavailable")
        }
    }

    private fun callMarketplace(name: String, data: Map<String, Any>): Task<HttpsCallableResult>? =
        secureFunctions?.getHttpsCallable(name)?.withTimeout(130, TimeUnit.SECONDS)?.call(data)

    private fun draftReference() = auth?.currentUser?.takeIf { it.isEmailVerified }?.let { user ->
        db?.collection("users")?.document(user.uid)?.collection("listingDrafts")?.document("current")
    }

    fun readListingDraft(done: (JSONObject?, String?) -> Unit) {
        val ref = draftReference() ?: return done(null, "Verify your email first")
        val uid = auth?.currentUser?.uid
        ref.get(Source.SERVER).addOnSuccessListener {
            if (auth?.currentUser?.uid == uid) done(if (it.exists()) featureDocument(it) else null, null)
        }.addOnFailureListener {
            if (auth?.currentUser?.uid == uid) done(null, it.localizedMessage ?: "Draft unavailable")
        }
    }

    fun saveListingDraft(draftId: String, revision: Long, fields: JSONObject, done: (Long?, String?) -> Unit) {
        val ref = draftReference() ?: return done(null, "Verify your email first")
        val uid = auth?.currentUser?.uid
        val storedFields = toFirestoreMap(fields)
        ref.firestore.runTransaction { transaction ->
            val current = transaction.get(ref)
            val matches = if (revision == 0L) {
                !current.exists() || (current.getString("state") in setOf("published", "discarded") &&
                    current.getString("draftId") != draftId)
            } else current.getString("state") == "open" && current.getString("draftId") == draftId &&
                current.getLong("revision") == revision
            check(matches) { "Draft changed on another device" }
            val next = revision + 1
            transaction.set(ref, mapOf(
                "draftId" to draftId, "revision" to next, "fields" to storedFields,
                "state" to "open", "updatedAt" to FieldValue.serverTimestamp()
            ))
            next
        }.addOnSuccessListener { if (auth?.currentUser?.uid == uid) done(it, null) }
            .addOnFailureListener { if (auth?.currentUser?.uid == uid) done(null, it.localizedMessage ?: "Draft unavailable") }
    }

    fun discardListingDraft(draftId: String, revision: Long, done: (String?) -> Unit) {
        val ref = draftReference() ?: return done("Verify your email first")
        finish(ref.firestore.runTransaction { transaction ->
            val current = transaction.get(ref)
            check(current.getString("state") == "open" && current.getString("draftId") == draftId &&
                current.getLong("revision") == revision) { "Draft changed on another device" }
            transaction.set(ref, mapOf(
                "draftId" to draftId, "revision" to revision + 1, "state" to "discarded",
                "updatedAt" to FieldValue.serverTimestamp()
            ))
            Unit
        }, done)
    }

    fun publish(car: JSONObject, selected: List<Uri>, done: (String?) -> Unit) =
        publish(car, selected, null, 0, done)

    fun publish(
        car: JSONObject, selected: List<Uri>, draftId: String?, draftRevision: Long, done: (String?) -> Unit
    ) {
        val user = auth?.currentUser ?: return done("Sign in required")
        if (!user.isEmailVerified) return done("Verify your email first")
        if (selected.isEmpty() || selected.size > 6) return done("Select 1 to 6 photos")
        val service = db ?: return done("Firestore unavailable")
        val store = storage ?: return done("Storage unavailable")
        val fields = runCatching { data(car, editing = false, photoCount = selected.size) }
            .getOrElse { return done(it.localizedMessage ?: "Invalid vehicle data") }
        val draft = if (draftId == null) null else draftReference() ?: return done("Draft unavailable")

        fun uploadPhotos(id: String, secure: Boolean) {
            val document = service.collection("listings").document(id)
            val uploaded = mutableListOf<com.google.firebase.storage.StorageReference>()
            val legacyUrls = mutableListOf<String>()

            fun failure(message: String) {
                if (!secure) uploaded.forEach { it.delete() }
                done(message)
            }

            fun writeListing(urls: List<String>) {
                if (auth?.currentUser?.uid != user.uid) return failure("Sign in required")
                fields["uid"] = user.uid
                fields["status"] = "active"
                fields["createdAt"] = FieldValue.serverTimestamp()
                fields["images"] = urls
                fields["image"] = urls.first()
                val grant = service.collection("listingUploads").document(id)
                val write = if (draft != null) {
                    service.runTransaction { transaction ->
                        val current = transaction.get(draft)
                        check(current.getString("state") == "open" && current.getString("draftId") == draftId &&
                            current.getLong("revision") == draftRevision) { "Draft changed on another device" }
                        transaction.set(document, fields)
                        transaction.update(grant, "used", true)
                        transaction.set(draft, mapOf(
                            "draftId" to draftId, "revision" to draftRevision + 1, "state" to "published",
                            "listingId" to document.id, "updatedAt" to FieldValue.serverTimestamp()
                        ))
                        Unit
                    }
                } else if (secure) {
                    service.batch().set(document, fields)
                        .update(grant, "used", true).commit()
                } else document.set(fields)
                write.addOnSuccessListener { done(null) }
                    .addOnFailureListener { error ->
                        document.get(Source.SERVER).addOnSuccessListener {
                            if (it.exists() && it.getString("uid") == user.uid) done(null)
                            else failure(error.localizedMessage ?: "Firestore write failed")
                        }.addOnFailureListener { done(error.localizedMessage ?: "Firestore write failed") }
                    }
            }

            fun uploadAt(index: Int) {
                if (auth?.currentUser?.uid != user.uid) return failure("Sign in required")
                Thread {
                    val photo = runCatching { compress(selected[index]) }
                    activity.runOnUiThread {
                        if (photo.isFailure) {
                            failure(photo.exceptionOrNull()?.localizedMessage ?: "Invalid photo")
                        } else if (secure) {
                            val task = callMarketplace("uploadListingPhoto", mapOf(
                                "listingId" to id,
                                "slot" to index,
                                "mimeType" to "image/jpeg",
                                "base64" to Base64.encodeToString(photo.getOrThrow(), Base64.NO_WRAP)
                            ))
                            if (task == null) {
                                failure("Marketplace unavailable")
                            } else {
                                task.addOnSuccessListener { result ->
                                    if (index + 1 < selected.size) {
                                        uploadAt(index + 1)
                                    } else {
                                        val urls = ((result.data as? Map<*, *>)?.get("images") as? List<*>)
                                            ?.filterIsInstance<String>()
                                        if (urls?.size == selected.size) writeListing(urls) else failure("Photos unavailable")
                                    }
                                }.addOnFailureListener { failure(it.localizedMessage ?: "Photo validation failed") }
                            }
                        } else {
                            val ref = store.reference.child("listings/${user.uid}/$id/$index.jpg")
                            ref.putBytes(photo.getOrThrow(),
                                com.google.firebase.storage.StorageMetadata.Builder()
                                    .setContentType("image/jpeg").build())
                                .addOnSuccessListener {
                                    uploaded.add(ref)
                                    ref.downloadUrl.addOnSuccessListener { uri ->
                                        legacyUrls.add(uri.toString())
                                        if (index + 1 == selected.size) writeListing(legacyUrls.toList())
                                        else uploadAt(index + 1)
                                    }.addOnFailureListener { failure(it.localizedMessage ?: "URL unavailable") }
                                }.addOnFailureListener { failure(it.localizedMessage ?: "Upload failed") }
                        }
                    }
                }.start()
            }
            uploadAt(0)
        }

        val startUpload: (Boolean) -> Unit = upload@{ secure ->
            if (!secure) {
                uploadPhotos(service.collection("listings").document().id, false)
            } else {
                val task = callMarketplace("reserveListingUpload", mapOf("count" to selected.size))
                    ?: return@upload done("Marketplace unavailable")
                task.addOnSuccessListener {
                    val id = (it.data as? Map<*, *>)?.get("listingId") as? String
                    if (id != null && isDocumentId(id)) uploadPhotos(id, true) else done("Upload unavailable")
                }.addOnFailureListener { done(it.localizedMessage ?: "Upload unavailable") }
            }
        }
        if (draft == null) withMarketplaceMode(done, startUpload)
        else draft.get(Source.SERVER).addOnSuccessListener { latest ->
            if (auth?.currentUser?.uid != user.uid) done("Sign in required")
            else if (latest.getString("draftId") == draftId && latest.getString("state") == "published") done(null)
            else if (latest.getString("draftId") == draftId && latest.getString("state") == "open" &&
                latest.getLong("revision") == draftRevision) startUpload(true)
            else done("Draft changed on another device")
        }.addOnFailureListener { done(it.localizedMessage ?: "Draft unavailable") }
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
        withMarketplaceMode(done) { secure ->
            if (secure) {
                val task = callMarketplace("submitListingReport", mapOf("listingId" to listingId, "reason" to reason))
                    ?: return@withMarketplaceMode done("Marketplace unavailable")
                finish(task, done)
            } else {
                val reportId = "${user.uid}_$listingId"
                val task = db?.collection("reports")?.document(reportId)?.set(mapOf(
                    "listingId" to listingId,
                    "reporterUid" to user.uid,
                    "reason" to reason,
                    "createdAt" to FieldValue.serverTimestamp()))
                    ?: return@withMarketplaceMode done("Firestore unavailable")
                finish(task, done)
            }
        }
    }

    fun close() {
        publicListener?.remove(); ownListener?.remove(); favoritesListener?.remove()
        authListener?.let { listener -> auth?.removeAuthStateListener(listener) }
    }
}
