package expo.modules.boaauto

import android.content.ContentProvider
import android.content.ContentValues
import android.content.Context
import android.database.Cursor
import android.graphics.Bitmap
import android.net.Uri
import android.os.ParcelFileDescriptor
import java.io.File
import java.io.FileNotFoundException
import java.net.HttpURLConnection
import java.net.URL
import java.security.MessageDigest

/**
 * Artwork for the car screen. Android Auto only loads content:// art, so
 * this serves it: every tile drawn full and opaque by BoaAutoArt (station
 * logos on the BOA stage, genre mosaics, the record for what's on), from
 * sources fetched once over https and cached. It only serves art the app
 * itself chose: a station or genre from the catalogue, or what's playing
 * now; never an arbitrary address or file.
 *
 *   content://<app>.boaauto.art/station/<station id>?v=<art version>
 *   content://<app>.boaauto.art/genre/<folder id>?v=<art version>
 *   content://<app>.boaauto.art/now?v=<hash of the art>
 */
class BoaAutoArtProvider : ContentProvider() {
  override fun onCreate() = true

  override fun getType(uri: Uri) = "image/*"

  override fun openFile(uri: Uri, mode: String): ParcelFileDescriptor {
    val ctx = context ?: throw FileNotFoundException()
    val id = uri.pathSegments.getOrNull(1)
    val art = when (uri.pathSegments.firstOrNull()) {
      "station" -> id?.let { BoaAutoStore.station(ctx, it) }?.let { stationArt(ctx, it.logo, it.name) }
      "genre" -> id?.let { BoaAutoStore.folders(ctx).firstOrNull { f -> f.id == it } }?.let { genreArt(ctx, it) }
      "now" -> BoaAutoStore.playback.let { p ->
        // The station's own name for its initials, not the song's.
        p.mediaId?.let { nowArt(ctx, p.artwork, BoaAutoStore.station(ctx, it)?.name ?: p.title.orEmpty()) }
      }
      else -> null
    } ?: throw FileNotFoundException(uri.toString())
    return ParcelFileDescriptor.open(art, ParcelFileDescriptor.MODE_READ_ONLY)
  }

  private fun stationArt(ctx: Context, logo: String?, name: String): File {
    val theme = BoaAutoStore.theme(ctx)
    return composed(ctx, "station|${theme.id}|$logo|$name") {
      val bitmap = logo?.let { load(ctx, it) }
      val tile = BoaAutoArt.plate(bitmap, name, theme)
      bitmap?.recycle()
      tile to (logo == null || bitmap != null)
    }
  }

  private fun genreArt(ctx: Context, folder: AutoFolder): File {
    val first = folder.stations.take(4)
    val theme = BoaAutoStore.theme(ctx)
    return composed(ctx, "genre|${theme.id}|${folder.title}|" + first.joinToString("|") { "${it.logo}:${it.name}" }) {
      val bitmaps = first.map { s -> s.logo?.let { load(ctx, it) } }
      val tile = BoaAutoArt.mosaic(bitmaps.zip(first.map { it.name }), theme)
      bitmaps.forEach { it?.recycle() }
      tile to first.indices.all { first[it].logo == null || bitmaps[it] != null }
    }
  }

  // What's on: the app's own rendered record edge to edge; a station logo
  // on its stage; with no art at all, the station's initials.
  private fun nowArt(ctx: Context, artwork: String?, name: String): File {
    if (artwork == null || Uri.parse(artwork).scheme != "file") return stationArt(ctx, artwork, name)
    val theme = BoaAutoStore.theme(ctx)
    return composed(ctx, "now|${theme.id}|$artwork") {
      val bitmap = load(ctx, artwork)
      val tile = bitmap?.let { BoaAutoArt.cover(it, theme) } ?: BoaAutoArt.plate(null, name, theme)
      bitmap?.recycle()
      tile to (bitmap != null)
    }
  }

  /** The source, fetched or found, decoded. Null if it can't be had. */
  private fun load(ctx: Context, source: String): Bitmap? =
    try {
      BoaAutoArt.decode(fileFor(ctx, source))
    } catch (e: Exception) {
      null
    }

  // A drawn tile, cached by what went into it. One drawn without all its
  // sources (a logo that didn't download) isn't kept for good: it's drawn
  // again next time, in case the logo can be had then.
  private fun composed(ctx: Context, key: String, draw: () -> Pair<Bitmap, Boolean>): File {
    val dir = File(ctx.cacheDir, "boa-auto-art").apply { mkdirs() }
    val file = File(dir, "art-" + sha1("$ART_VERSION|$key") + ".jpg")
    if (file.isFile && file.length() > 0) return file
    val (bitmap, complete) = draw()
    val target = if (complete) file else File(dir, "miss-" + sha1(key) + ".jpg")
    try {
      val part = File(dir, "${target.name}.${Thread.currentThread().id}.part")
      part.outputStream().use { bitmap.compress(Bitmap.CompressFormat.JPEG, 92, it) }
      if (!part.renameTo(target)) throw FileNotFoundException(key)
    } finally {
      bitmap.recycle()
    }
    return target
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
      val part = File(to.parentFile, "${to.name}.${Thread.currentThread().id}.part")
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
    // Bumped whenever BoaAutoArt draws differently, so the car (and our
    // cache) let go of the old tiles.
    private const val ART_VERSION = "3"

    private fun authority(ctx: Context) = "${ctx.packageName}.boaauto.art"

    // The art's version and the car theme: a new theme is a new address, so
    // the car fetches every tile again instead of showing the old ones.
    private fun version(ctx: Context) = "$ART_VERSION.${BoaAutoStore.theme(ctx).id}"

    fun stationUri(ctx: Context, id: String): Uri =
      Uri.Builder().scheme("content").authority(authority(ctx)).appendPath("station").appendPath(id)
        .appendQueryParameter("v", version(ctx)).build()

    fun genreUri(ctx: Context, folderId: String): Uri =
      Uri.Builder().scheme("content").authority(authority(ctx)).appendPath("genre").appendPath(folderId)
        .appendQueryParameter("v", version(ctx)).build()

    // The hash changes the address whenever the art does, so the car
    // doesn't keep showing the last station's.
    fun nowPlayingUri(ctx: Context, artwork: String): Uri =
      Uri.Builder().scheme("content").authority(authority(ctx)).appendPath("now")
        .appendQueryParameter("v", sha1("${version(ctx)}|$artwork").take(12)).build()

    private fun sha1(text: String) =
      MessageDigest.getInstance("SHA-1").digest(text.toByteArray()).joinToString("") { "%02x".format(it) }
  }
}
