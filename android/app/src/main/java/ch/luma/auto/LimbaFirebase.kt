package ch.luma.auto

import android.app.Activity
import android.graphics.BitmapFactory
import android.net.Uri
import com.google.firebase.FirebaseApp
import com.google.firebase.FirebaseOptions
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.auth.FirebaseUser
import com.google.firebase.firestore.DocumentSnapshot
import com.google.firebase.firestore.FieldValue
import com.google.firebase.firestore.FirebaseFirestore
import com.google.firebase.firestore.ListenerRegistration
import com.google.firebase.storage.FirebaseStorage
import org.json.JSONArray
import org.json.JSONObject
import java.io.ByteArrayOutputStream

/**
 * Shared Limba production backend, opt-in by supplying assets/firebase-config.json.
 * There are no administrator credentials or hidden passwords in the APK.
 * Demo mode is entirely local when the configuration is absent.
 */
class LimbaFirebase(private val activity: Activity) {
    val auth: FirebaseAuth?
    private val db: FirebaseFirestore?
    private val storage: FirebaseStorage?
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
            "transmission","body","condition","accidentStatus","conditionNote","sellerType",
            "contactEmail","image","status")) {
            item.put(key, snapshot.getString(key) ?: "")
        }
        for (key in listOf("year","mileage","power","price")) {
            item.put(key, snapshot.getLong(key) ?: 0)
        }
        val images = JSONArray()
        (snapshot.get("images") as? List<*>)?.forEach { images.put(it.toString()) }
        item.put("images", images)
        return item
    }

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

    private fun data(car: JSONObject): MutableMap<String, Any> {
        val fields = mutableMapOf<String,Any>()
        for (key in listOf("make","model","modelExtension","description","city","country","fuel","transmission",
            "body","condition","accidentStatus","conditionNote","sellerType")) {
            fields[key] = car.optString(key)
        }
        // Public listing documents never contain seller PII.
        fields["contactEmail"] = ""
        fields["title"] = listOf(car.optString("make"),car.optString("model"),car.optString("modelExtension")).filter{it.isNotBlank()}.joinToString(" ")
        fields["category"] = "vehicles"
        for (key in listOf("year","mileage","power","price")) fields[key] = car.optInt(key)
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
        val document = service.collection("listings").document()
        val uploaded = mutableListOf<com.google.firebase.storage.StorageReference>()
        val urls = mutableListOf<String>()
        fun failure(message: String) {
            uploaded.forEach { it.delete() } // Best-effort rollback; monitor orphan files separately.
            done(message)
        }
        fun uploadAt(index: Int) {
            if (index == selected.size) {
                val fields = data(car)
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
        val fields = data(car)
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
