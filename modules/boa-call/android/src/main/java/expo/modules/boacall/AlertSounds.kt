package expo.modules.boacall

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.ContentValues
import android.content.Context
import android.media.AudioAttributes
import android.media.MediaMetadataRetriever
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.provider.MediaStore

/**
 * Your own message sound, ringing with BOA closed.
 *
 * Android fixes a notification's sound on its channel, and a push that
 * arrives with the app closed can only name a channel. A channel can use any
 * content:// sound the system can read, but not a file inside BOA's private
 * storage. So the clip you choose is copied into the phone's shared
 * Notifications folder (MediaStore, no permission needed for files an app
 * makes itself, Android 10 and up) and given a channel of its own:
 * boa-chat-own_<id>. The id goes to the database with your push token
 * (push_tokens.sound), and message-push sends to that channel.
 *
 * A channel's sound can't be changed once it's made, so each clip gets a new
 * id; the old channel and its copy are removed when the next one is made.
 */
object AlertSounds {
  private const val PREFS = "boa_alert_sounds"
  private const val KEY_URI = "uri"
  private const val CHANNEL_PREFIX = "boa-chat-"
  private const val OWN_PREFIX = "own_"

  /** An alert is a moment, not a song: a clip longer than this stays an in-app sound only. */
  const val MAX_MS = 30_000L

  private fun mimeOf(name: String): String = when (name.substringAfterLast('.', "").lowercase()) {
    "m4a", "mp4" -> "audio/mp4"
    "aac" -> "audio/aac"
    "wav" -> "audio/x-wav"
    "ogg", "oga", "opus" -> "audio/ogg"
    "flac" -> "audio/flac"
    "amr" -> "audio/amr"
    else -> "audio/mpeg"
  }

  private fun lengthMs(context: Context, src: Uri): Long? {
    val retriever = MediaMetadataRetriever()
    return try {
      retriever.setDataSource(context, src)
      retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_DURATION)?.toLongOrNull()
    } catch (_: Exception) {
      null
    } finally {
      runCatching { retriever.release() }
    }
  }

  /**
   * Makes `id` (own_<something>) ring this clip. True once the channel is
   * there; false if the phone can't (older than Android 10), the clip can't
   * be read or is too long, in which case the phone's own sound plays.
   */
  fun register(context: Context, fileUri: String, id: String, title: String): Boolean {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) return false
    if (!id.startsWith(OWN_PREFIX)) return false
    return try {
      val src = Uri.parse(fileUri)
      val ms = lengthMs(context, src) ?: return false
      if (ms <= 0 || ms > MAX_MS) return false

      val resolver = context.contentResolver
      val name = "boa-alert-$id.${fileUri.substringAfterLast('.', "mp3").lowercase().take(5)}"
      val values = ContentValues().apply {
        put(MediaStore.Audio.Media.DISPLAY_NAME, name)
        put(MediaStore.Audio.Media.TITLE, title)
        put(MediaStore.Audio.Media.MIME_TYPE, mimeOf(name))
        put(MediaStore.Audio.Media.RELATIVE_PATH, Environment.DIRECTORY_NOTIFICATIONS + "/BOA")
        put(MediaStore.Audio.Media.IS_NOTIFICATION, 1)
        put(MediaStore.Audio.Media.IS_PENDING, 1)
      }
      val collection = MediaStore.Audio.Media.getContentUri(MediaStore.VOLUME_EXTERNAL_PRIMARY)
      val dest = resolver.insert(collection, values) ?: return false
      try {
        val input = resolver.openInputStream(src) ?: throw IllegalStateException("no input")
        val output = resolver.openOutputStream(dest) ?: throw IllegalStateException("no output")
        input.use { i -> output.use { o -> i.copyTo(o) } }
        val done = ContentValues().apply { put(MediaStore.Audio.Media.IS_PENDING, 0) }
        resolver.update(dest, done, null, null)
      } catch (e: Exception) {
        runCatching { resolver.delete(dest, null, null) }
        return false
      }

      val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
      val channel = NotificationChannel(CHANNEL_PREFIX + id, "Messages: your own sound", NotificationManager.IMPORTANCE_HIGH).apply {
        setSound(
          dest,
          AudioAttributes.Builder()
            .setUsage(AudioAttributes.USAGE_NOTIFICATION)
            .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
            .build(),
        )
        enableVibration(true)
        vibrationPattern = longArrayOf(0, 220, 110, 220)
        lockscreenVisibility = Notification.VISIBILITY_PRIVATE
      }
      manager.createNotificationChannel(channel)

      // The new one is in place: the last clip's channel and copy can go.
      val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
      removeOld(context, manager, keepChannel = CHANNEL_PREFIX + id)
      prefs.edit().putString(KEY_URI, dest.toString()).apply()
      true
    } catch (_: Exception) {
      false
    }
  }

  /** Back to the phone's own sound: removes every own channel and the copy. */
  fun clear(context: Context) {
    val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    removeOld(context, manager, keepChannel = null)
    context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().remove(KEY_URI).apply()
  }

  private fun removeOld(context: Context, manager: NotificationManager, keepChannel: String?) {
    manager.notificationChannels
      .filter { it.id.startsWith(CHANNEL_PREFIX + OWN_PREFIX) && it.id != keepChannel }
      .forEach { runCatching { manager.deleteNotificationChannel(it.id) } }
    val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
    prefs.getString(KEY_URI, null)?.let { old ->
      runCatching { context.contentResolver.delete(Uri.parse(old), null, null) }
    }
  }
}
