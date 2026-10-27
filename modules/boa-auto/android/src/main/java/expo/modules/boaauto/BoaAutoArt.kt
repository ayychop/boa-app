package expo.modules.boaauto

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.LinearGradient
import android.graphics.Paint
import android.graphics.RadialGradient
import android.graphics.Rect
import android.graphics.RectF
import android.graphics.Shader
import android.graphics.Typeface
import java.io.File
import kotlin.math.max
import kotlin.math.min

/**
 * The car screen's artwork, drawn so every tile is full and opaque. Android
 * Auto shows a transparent logo on flat black, and blurs the now playing
 * art into the whole screen's background, so a small or see-through logo
 * leaves the car's screen mostly black. Here every station gets a stage:
 * the BOA near-black with a gold glow, a soft wash of the logo's own
 * colours, and the logo itself as large as it fits. No logo: the station's
 * initials in gold. Genres get a 2x2 mosaic of their first stations.
 */
internal object BoaAutoArt {
  /** Every tile is this square, in pixels: sharp on the largest car screens. */
  const val SIZE = 1024

  private val INK = Color.parseColor("#050506")
  private val STAGE = Color.parseColor("#1A1A1D")
  private val GOLD = Color.parseColor("#E2A84B")
  private val GOLD_DEEP = Color.parseColor("#9A6A22")

  /** A station's logo on its stage, or its initials when there's no logo. */
  fun plate(logo: Bitmap?, name: String, size: Int = SIZE): Bitmap {
    val out = Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888)
    val c = Canvas(out)
    stage(c, size)
    if (logo == null) {
      monogram(c, name, size)
      return out
    }
    wash(c, logo, size)
    val inset = size * 0.12f
    fit(c, logo, RectF(inset, inset, size - inset, size - inset), size)
    return out
  }

  /** Art the app rendered itself (the record for what's on): edge to edge, centre-cropped. */
  fun cover(art: Bitmap, size: Int = SIZE): Bitmap {
    val out = Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888)
    val c = Canvas(out)
    // Under any transparency in the record, so nothing shows through as black.
    stage(c, size)
    val side = min(art.width, art.height)
    val left = (art.width - side) / 2
    val top = (art.height - side) / 2
    c.drawBitmap(art, Rect(left, top, left + side, top + side), Rect(0, 0, size, size), Paint(Paint.FILTER_BITMAP_FLAG))
    return out
  }

  /** A genre's tile: its first four stations' plates, 2x2. Fewer than four: the first one's plate. */
  fun mosaic(stations: List<Pair<Bitmap?, String>>, size: Int = SIZE): Bitmap {
    if (stations.size < 4) return plate(stations.firstOrNull()?.first, stations.firstOrNull()?.second.orEmpty(), size)
    val out = Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888)
    val c = Canvas(out)
    stage(c, size)
    val gutter = size / 128
    val cell = (size - gutter) / 2
    stations.take(4).forEachIndexed { i, (logo, name) ->
      val tile = plate(logo, name, cell)
      val x = (i % 2) * (cell + gutter)
      val y = (i / 2) * (cell + gutter)
      c.drawBitmap(tile, x.toFloat(), y.toFloat(), null)
      tile.recycle()
    }
    return out
  }

  /** The BOA stage: near-black, lit gold from the top. */
  private fun stage(c: Canvas, size: Int) {
    val s = size.toFloat()
    c.drawPaint(Paint().apply { shader = LinearGradient(0f, 0f, s, s, STAGE, INK, Shader.TileMode.CLAMP) })
    c.drawPaint(
      Paint().apply {
        shader = RadialGradient(
          s * 0.5f, s * 0.08f, s * 0.9f,
          intArrayOf(withAlpha(GOLD, 0x59), withAlpha(GOLD_DEEP, 0x1F), Color.TRANSPARENT),
          floatArrayOf(0f, 0.45f, 1f),
          Shader.TileMode.CLAMP,
        )
      },
    )
  }

  // The logo's colours, blurred across the whole tile: shrunk to a few
  // pixels and stretched back up, then darkened at the edges.
  private fun wash(c: Canvas, logo: Bitmap, size: Int) {
    val tiny = Bitmap.createScaledBitmap(logo, 10, 10, true)
    val soft = Bitmap.createScaledBitmap(tiny, 64, 64, true)
    val bleed = size / 6
    c.drawBitmap(soft, null, Rect(-bleed, -bleed, size + bleed, size + bleed), Paint(Paint.FILTER_BITMAP_FLAG).apply { alpha = 150 })
    if (tiny !== logo) tiny.recycle()
    if (soft !== tiny && soft !== logo) soft.recycle()
    val s = size.toFloat()
    c.drawPaint(Paint().apply { shader = RadialGradient(s / 2, s / 2, s * 0.75f, Color.TRANSPARENT, withAlpha(INK, 0xB3), Shader.TileMode.CLAMP) })
  }

  // The logo as large as fits in the box, centred, with a soft shadow under it.
  private fun fit(c: Canvas, logo: Bitmap, box: RectF, size: Int) {
    val scale = min(box.width() / logo.width, box.height() / logo.height)
    val w = logo.width * scale
    val h = logo.height * scale
    val dst = RectF(box.centerX() - w / 2, box.centerY() - h / 2, box.centerX() + w / 2, box.centerY() + h / 2)
    val paint = Paint(Paint.FILTER_BITMAP_FLAG or Paint.ANTI_ALIAS_FLAG).apply {
      setShadowLayer(size * 0.04f, 0f, size * 0.015f, withAlpha(INK, 0x99))
    }
    c.drawBitmap(logo, null, dst, paint)
  }

  // The station's initials in gold, inside a faint gold ring.
  private fun monogram(c: Canvas, name: String, size: Int) {
    val s = size.toFloat()
    c.drawCircle(s / 2, s / 2, s * 0.31f, Paint(Paint.ANTI_ALIAS_FLAG).apply {
      style = Paint.Style.STROKE
      strokeWidth = s * 0.012f
      color = withAlpha(GOLD, 0x66)
    })
    val text = Paint(Paint.ANTI_ALIAS_FLAG).apply {
      color = GOLD
      typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
      textSize = s * 0.24f
      textAlign = Paint.Align.CENTER
      letterSpacing = 0.04f
    }
    val m = text.fontMetrics
    c.drawText(initials(name), s / 2, s / 2 - (m.ascent + m.descent) / 2, text)
  }

  private fun initials(name: String): String =
    name.split(Regex("\\s+")).mapNotNull { word -> word.firstOrNull { it.isLetterOrDigit() } }.take(2).joinToString("").uppercase().ifEmpty { "B" }

  private fun withAlpha(color: Int, alpha: Int) = Color.argb(alpha, Color.red(color), Color.green(color), Color.blue(color))

  /** A picture file decoded no bigger than it needs to be for a tile. Null if it isn't one. */
  fun decode(file: File): Bitmap? {
    val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
    BitmapFactory.decodeFile(file.path, bounds)
    if (bounds.outWidth <= 0 || bounds.outHeight <= 0) return null
    var sample = 1
    while (max(bounds.outWidth, bounds.outHeight) / (sample * 2) >= SIZE) sample *= 2
    return BitmapFactory.decodeFile(file.path, BitmapFactory.Options().apply { inSampleSize = sample })
  }
}
