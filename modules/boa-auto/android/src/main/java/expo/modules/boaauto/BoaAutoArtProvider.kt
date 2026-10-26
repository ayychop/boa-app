package expo.modules.boaauto

import android.content.ContentProvider
import android.content.ContentValues
import android.content.Context
import android.database.Cursor
import android.net.Uri
import android.os.ParcelFileDescriptor
import java.io.File
import java.io.FileNotFoundException
import java.net.HttpURLConnection
import java.net.URL
import java.security.MessageDigest

/**
 * Artwork for the car screen. Android Auto only loads content:// art, so
 * this serves station logos (fetched once over https, then cached) and the
 * record artwork the app renders for what's on. It only serves art the app
 * itself chose: a station from the catalogue, or what's playing now; never
 * an arbitrary address or file.
 *
 *   content://<app>.boaauto.art/station/<station id>
 *   content://<app>.boaauto.art/now?v=<hash of the art>
 */
class BoaAutoArtProvider : ContentProvider() {
  override fun onCreate() = true

  override fun getType(uri: Uri) = "image/*"

  override fun openFile(uri: Uri, mode: String): ParcelFileDescriptor {
    val ctx = context ?: throw FileNotFoundException()
    val source = when (uri.pathSegments.firstOrNull()) {
      "station" -> uri.pathSegments.getOrNull(1)?.let { BoaAutoStore.station(ctx, it)?.logo }
      "now" -> BoaAutoStore.playback.artwork
      else -> null
    } ?: throw FileNotFoundException(uri.toString())
    return ParcelFileDescriptor.open(fileFor(ctx, source), ParcelFileDescriptor.MODE_READ_ONLY)
  }

  private fun fileFor(ctx: Context, source: String): File {
    val parsed = Uri.parse(source)
    if (parsed.scheme == "file") {
      // The app's rendered records live in its cache.
      val file = File(parsed.path ?: "").canonicalFile
      val allowed = listOf(ctx.cacheDir, ctx.filesDir).map { it.canonicalPath + File.separator }
      if (file.isFile && allowed.any { file.path.startsWith(it) }) return file
      throw FileNotFoundException(source)
    }
    if (parsed.scheme != "https" && parsed.scheme != "http") throw FileNotFoundException(source)
    val dir = File(ctx.cacheDir, "boa-auto-art").apply { mkdirs() }
    val file = File(dir, sha1(source))
    if (file.isFile && file.length() > 0) return file
    download(source, file)
    return file
  }

  private fun download(source: String, to: File) {
    val conn = URL(source).openConnection() as HttpURLConnection
    try {
      conn.connectTimeout = TIMEOUT_MS
      conn.readTimeout = TIMEOUT_MS
      conn.instanceFollowRedirects = true
      if (conn.responseCode !in 200..299) throw FileNotFoundException(source)
      val part = File(to.parentFile, to.name + ".part")
      conn.inputStream.use { input ->
        part.outputStream().use { output ->
          val buffer = ByteArray(16 * 1024)
          var total = 0
          while (true) {
            val n = input.read(buffer)
            if (n < 0) break
            total += n
            if (total > MAX_BYTES) throw FileNotFoundException("$source is too big")
            output.write(buffer, 0, n)
          }
        }
      }
      if (!part.renameTo(to)) throw FileNotFoundException(source)
    } catch (e: FileNotFoundException) {
      throw e
    } catch (e: Exception) {
      throw FileNotFoundException("$source: ${e.message}")
    } finally {
      conn.disconnect()
    }
  }

  override fun query(uri: Uri, projection: Array<out String>?, selection: String?, selectionArgs: Array<out String>?, sortOrder: String?): Cursor? = null

  override fun insert(uri: Uri, values: ContentValues?): Uri? = null

  override fun delete(uri: Uri, selection: String?, selectionArgs: Array<out String>?) = 0

  override fun update(uri: Uri, values: ContentValues?, selection: String?, selectionArgs: Array<out String>?) = 0

  companion object {
    private const val TIMEOUT_MS = 8000
    private const val MAX_BYTES = 3 * 1024 * 1024

    private fun authority(ctx: Context) = "${ctx.packageName}.boaauto.art"

    fun stationUri(ctx: Context, id: String): Uri =
      Uri.Builder().scheme("content").authority(authority(ctx)).appendPath("station").appendPath(id).build()

    // The hash changes the address whenever the art does, so the car
    // doesn't keep showing the last station's.
    fun nowPlayingUri(ctx: Context, artwork: String): Uri =
      Uri.Builder().scheme("content").authority(authority(ctx)).appendPath("now")
        .appendQueryParameter("v", sha1(artwork).take(12)).build()

    private fun sha1(text: String) =
      MessageDigest.getInstance("SHA-1").digest(text.toByteArray()).joinToString("") { "%02x".format(it) }
  }
}
