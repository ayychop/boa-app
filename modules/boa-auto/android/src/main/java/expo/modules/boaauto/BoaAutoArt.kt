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

/** How a car theme's stage is finished. */
internal enum class Texture { NONE, AURORA, CHROME, HORIZON, CARBON }

/**
 * A car theme (Profile > Car Settings): the stage every tile and the now
 * playing art sit on, which Android Auto also blurs into the whole screen's
 * background. ink and stage are the base, glow and glowDeep the light (from
 * glowX, glowY, as fractions of the tile), accent the monogram's colour.
 */
internal data class CarTheme(
  val id: String,
  val ink: Int,
  val stage: Int,
  val glow: Int,
  val glowDeep: Int,
  val accent: Int,
  val glowX: Float,
  val glowY: Float,
  val texture: Texture,
)

internal object CarThemes {
  private fun c(hex: String) = Color.parseColor(hex)

  val ALL = listOf(
    // The BOA look: near-black, lit gold from the top.
    CarTheme("noir", c("#050506"), c("#1A1A1D"), c("#E2A84B"), c("#9A6A22"), c("#E2A84B"), 0.5f, 0.08f, Texture.NONE),
    // Northern lights: teal and violet ribbons over deep night.
    CarTheme("aurora", c("#03060B"), c("#0B1A24"), c("#2EE6C5"), c("#6B3FD8"), c("#7FF3DD"), 0.3f, 0.1f, Texture.AURORA),
    // Brushed silver under a cool blue light, like a concept car's dash.
    CarTheme("chrome", c("#05070B"), c("#1C222C"), c("#C9D6E8"), c("#3B5B8C"), c("#DDE6F2"), 0.7f, 0.05f, Texture.CHROME),
    // A low sun on a neon horizon, the drive home at dusk.
    CarTheme("sunset", c("#0A0510"), c("#2A0F2E"), c("#FF8A3D"), c("#D6246E"), c("#FFB36B"), 0.5f, 0.82f, Texture.HORIZON),
    // Woven carbon fibre lit race red.
    CarTheme("carbon", c("#050505"), c("#151515"), c("#E0182D"), c("#6A0A14"), c("#FF4A5C"), 0.5f, 0.0f, Texture.CARBON),
  )

  val DEFAULT = ALL[0]

  fun byId(id: String?) = ALL.firstOrNull { it.id == id } ?: DEFAULT
}

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

  /** A station's logo on its stage, or its initials when there's no logo. */
  fun plate(logo: Bitmap?, name: String, theme: CarTheme = CarThemes.DEFAULT, size: Int = SIZE): Bitmap {
    val out = Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888)
    val c = Canvas(out)
    stage(c, size, theme)
    if (logo == null) {
      monogram(c, name, size, theme)
      return out
    }
    wash(c, logo, size, theme)
    val inset = size * 0.12f
    fit(c, logo, RectF(inset, inset, size - inset, size - inset), size)
    return out
  }

  /** Art the app rendered itself (the record for what's on): edge to edge, centre-cropped. */
  fun cover(art: Bitmap, theme: CarTheme = CarThemes.DEFAULT, size: Int = SIZE): Bitmap {
    val out = Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888)
    val c = Canvas(out)
    // Under any transparency in the record, so nothing shows through as black.
    stage(c, size, theme)
    val side = min(art.width, art.height)
    val left = (art.width - side) / 2
    val top = (art.height - side) / 2
    c.drawBitmap(art, Rect(left, top, left + side, top + side), Rect(0, 0, size, size), Paint(Paint.FILTER_BITMAP_FLAG))
    return out
  }

  /** A genre's tile: its first four stations' plates, 2x2. Fewer than four: the first one's plate. */
  fun mosaic(stations: List<Pair<Bitmap?, String>>, theme: CarTheme = CarThemes.DEFAULT, size: Int = SIZE): Bitmap {
    if (stations.size < 4) return plate(stations.firstOrNull()?.first, stations.firstOrNull()?.second.orEmpty(), theme, size)
    val out = Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888)
    val c = Canvas(out)
    stage(c, size, theme)
    val gutter = size / 128
    val cell = (size - gutter) / 2
    stations.take(4).forEachIndexed { i, (logo, name) ->
      val tile = plate(logo, name, theme, cell)
      val x = (i % 2) * (cell + gutter)
      val y = (i / 2) * (cell + gutter)
      c.drawBitmap(tile, x.toFloat(), y.toFloat(), null)
      tile.recycle()
    }
    return out
  }

  /** The theme's stage: its base, lit by its glow, finished with its texture. */
  private fun stage(c: Canvas, size: Int, theme: CarTheme) {
    val s = size.toFloat()
    c.drawPaint(Paint().apply { shader = LinearGradient(0f, 0f, s, s, theme.stage, theme.ink, Shader.TileMode.CLAMP) })
    texture(c, s, theme)
    c.drawPaint(
      Paint().apply {
        shader = RadialGradient(
          s * theme.glowX, s * theme.glowY, s * 0.9f,
          intArrayOf(withAlpha(theme.glow, 0x59), withAlpha(theme.glowDeep, 0x1F), Color.TRANSPARENT),
          floatArrayOf(0f, 0.45f, 1f),
          Shader.TileMode.CLAMP,
        )
      },
    )
  }

  // Each theme's finish, drawn soft so a logo or the record always reads over it.
  private fun texture(c: Canvas, s: Float, theme: CarTheme) {
    val paint = Paint(Paint.ANTI_ALIAS_FLAG)
    when (theme.texture) {
      Texture.NONE -> Unit
      // Two ribbons of light sweeping across, teal over violet.
      Texture.AURORA -> {
        listOf(Triple(0.28f, theme.glow, 0x4D), Triple(0.55f, theme.glowDeep, 0x59)).forEach { (y, color, alpha) ->
          paint.shader = LinearGradient(0f, s * (y - 0.18f), 0f, s * (y + 0.18f), intArrayOf(Color.TRANSPARENT, withAlpha(color, alpha), Color.TRANSPARENT), null, Shader.TileMode.CLAMP)
          c.save()
          c.rotate(-14f, s / 2, s / 2)
          c.drawRect(-s * 0.2f, s * (y - 0.18f), s * 1.2f, s * (y + 0.18f), paint)
          c.restore()
        }
      }
      // Fine brushed lines and one diagonal sheen of light.
      Texture.CHROME -> {
        paint.shader = null
        paint.strokeWidth = s / 1024f
        val step = s / 160f
        var y = 0f
        var i = 0
        while (y < s) {
          paint.color = withAlpha(theme.accent, if (i % 3 == 0) 0x12 else 0x08)
          c.drawLine(0f, y, s, y, paint)
          y += step
          i++
        }
        paint.shader = LinearGradient(0f, 0f, s, s, intArrayOf(Color.TRANSPARENT, withAlpha(theme.accent, 0x33), Color.TRANSPARENT), floatArrayOf(0.3f, 0.5f, 0.7f), Shader.TileMode.CLAMP)
        c.drawPaint(paint)
      }
      // A sun low on the horizon and the grid running away from it.
      Texture.HORIZON -> {
        val horizon = s * 0.72f
        paint.shader = LinearGradient(0f, 0f, 0f, horizon, intArrayOf(Color.TRANSPARENT, withAlpha(theme.glowDeep, 0x40), withAlpha(theme.glow, 0x66)), floatArrayOf(0f, 0.7f, 1f), Shader.TileMode.CLAMP)
        c.drawRect(0f, 0f, s, horizon, paint)
        paint.shader = null
        paint.style = Paint.Style.STROKE
        paint.strokeWidth = s / 400f
        paint.color = withAlpha(theme.glow, 0x40)
        var gap = s * 0.02f
        var y = horizon
        while (y < s) {
          c.drawLine(0f, y, s, y, paint)
          gap *= 1.35f
          y += gap
        }
        for (k in -6..6) c.drawLine(s / 2, horizon, s / 2 + k * s * 0.22f, s, paint)
        paint.style = Paint.Style.FILL
      }
      // A tight diagonal weave, barely there, catching the light.
      Texture.CARBON -> {
        val cell = s / 48f
        var row = 0
        var y = 0f
        while (y < s) {
          var x = if (row % 2 == 0) 0f else cell
          while (x < s) {
            paint.shader = LinearGradient(x, y, x + cell, y + cell, withAlpha(Color.WHITE, 0x0D), Color.TRANSPARENT, Shader.TileMode.CLAMP)
            c.drawRect(x, y, x + cell, y + cell, paint)
            x += cell * 2
          }
          y += cell
          row++
        }
      }
    }
  }

  // The logo's colours, blurred across the whole tile: shrunk to a few
  // pixels and stretched back up, then darkened at the edges.
  private fun wash(c: Canvas, logo: Bitmap, size: Int, theme: CarTheme) {
    val tiny = Bitmap.createScaledBitmap(logo, 10, 10, true)
    val soft = Bitmap.createScaledBitmap(tiny, 64, 64, true)
    val bleed = size / 6
    c.drawBitmap(soft, null, Rect(-bleed, -bleed, size + bleed, size + bleed), Paint(Paint.FILTER_BITMAP_FLAG).apply { alpha = 150 })
    if (tiny !== logo) tiny.recycle()
    if (soft !== tiny && soft !== logo) soft.recycle()
    val s = size.toFloat()
    c.drawPaint(Paint().apply { shader = RadialGradient(s / 2, s / 2, s * 0.75f, Color.TRANSPARENT, withAlpha(theme.ink, 0xB3), Shader.TileMode.CLAMP) })
  }

  // The logo as large as fits in the box, centred, with a soft shadow under it.
  private fun fit(c: Canvas, logo: Bitmap, box: RectF, size: Int) {
    val scale = min(box.width() / logo.width, box.height() / logo.height)
    val w = logo.width * scale
    val h = logo.height * scale
    val dst = RectF(box.centerX() - w / 2, box.centerY() - h / 2, box.centerX() + w / 2, box.centerY() + h / 2)
    val paint = Paint(Paint.FILTER_BITMAP_FLAG or Paint.ANTI_ALIAS_FLAG).apply {
      setShadowLayer(size * 0.04f, 0f, size * 0.015f, withAlpha(Color.BLACK, 0x99))
    }
    c.drawBitmap(logo, null, dst, paint)
  }

  // The station's initials in the theme's accent, inside a faint ring of it.
  private fun monogram(c: Canvas, name: String, size: Int, theme: CarTheme) {
    val s = size.toFloat()
    c.drawCircle(s / 2, s / 2, s * 0.31f, Paint(Paint.ANTI_ALIAS_FLAG).apply {
      style = Paint.Style.STROKE
      strokeWidth = s * 0.012f
      color = withAlpha(theme.accent, 0x66)
    })
    val text = Paint(Paint.ANTI_ALIAS_FLAG).apply {
      color = theme.accent
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
