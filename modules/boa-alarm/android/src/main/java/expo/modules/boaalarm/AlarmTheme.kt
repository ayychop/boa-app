package expo.modules.boaalarm

import android.graphics.Color

/**
 * One look for the alarm page. The six below are chosen in the app's Alarm
 * Settings (the id is kept by AlarmStore) and drawn by AlarmActivity.
 *
 * Every theme is a dark (or, for Ivory, a warm light) ground, a few large
 * soft glows that drift and are blurred on Android 12+, a time in a gold
 * (or tinted) gradient, and two buttons: a lit primary one and a frosted
 * glass one. src/data/alarmThemes.js mirrors the ids, names and colours for
 * the previews in the app, so keep the two in step.
 */
data class AlarmTheme(
  val id: String,
  val name: String,
  val bgTop: Int,
  val bgBottom: Int,
  val orbs: List<Orb>,
  val timeFrom: Int,
  val timeTo: Int,
  val text: Int,
  val muted: Int,
  val accent: Int,
  val buttonFrom: Int,
  val buttonTo: Int,
  val buttonText: Int,
  val glass: Int,
  val glassStroke: Int,
  val light: Boolean = false,
) {
  /** x, y: the glow's centre as a fraction of the screen; size: its width as a fraction of the screen's long side. */
  data class Orb(val color: Int, val x: Float, val y: Float, val size: Float)

  companion object {
    const val DEFAULT = "gilded"

    private fun c(hex: String) = Color.parseColor(hex)

    val all: List<AlarmTheme> by lazy {
      listOf(
        // Black and gold: the house look.
        AlarmTheme(
          id = "gilded", name = "Gilded",
          bgTop = c("#050506"), bgBottom = c("#0C0905"),
          orbs = listOf(
            Orb(c("#77E2A84B"), 0.82f, 0.10f, 0.95f),
            Orb(c("#558A5A1C"), 0.08f, 0.88f, 0.85f),
          ),
          timeFrom = c("#FBE3A6"), timeTo = c("#C98A2B"),
          text = c("#F3EFE8"), muted = c("#A9A49B"), accent = c("#E2A84B"),
          buttonFrom = c("#F6D38A"), buttonTo = c("#E2A84B"), buttonText = c("#050506"),
          glass = c("#1FFFFFFF"), glassStroke = c("#55F6D38A"),
        ),
        // Teal and violet light over deep blue-black.
        AlarmTheme(
          id = "aurora", name = "Aurora",
          bgTop = c("#03070C"), bgBottom = c("#070612"),
          orbs = listOf(
            Orb(c("#771FB6A6"), 0.12f, 0.14f, 1.00f),
            Orb(c("#776A4CE0"), 0.92f, 0.56f, 1.00f),
            Orb(c("#33E2A84B"), 0.50f, 0.96f, 0.70f),
          ),
          timeFrom = c("#F4F1E4"), timeTo = c("#8FE3D6"),
          text = c("#EEF3F2"), muted = c("#93A7A8"), accent = c("#7FE3D4"),
          buttonFrom = c("#D8F8F1"), buttonTo = c("#6FD6C6"), buttonText = c("#03120F"),
          glass = c("#1FFFFFFF"), glassStroke = c("#557FE3D4"),
        ),
        // First light: amber and rose rising from the bottom edge.
        AlarmTheme(
          id = "sunrise", name = "Sunrise",
          bgTop = c("#0A0507"), bgBottom = c("#1B0C08"),
          orbs = listOf(
            Orb(c("#88FF8A4C"), 0.50f, 1.04f, 1.35f),
            Orb(c("#66FF5E7A"), 0.06f, 0.92f, 0.95f),
            Orb(c("#44FFC36B"), 0.94f, 0.78f, 0.85f),
          ),
          timeFrom = c("#FFEBC8"), timeTo = c("#FFB45A"),
          text = c("#FBEFE3"), muted = c("#B8A395"), accent = c("#FFB45A"),
          buttonFrom = c("#FFDDA6"), buttonTo = c("#FF9B4F"), buttonText = c("#1B0C08"),
          glass = c("#1FFFFFFF"), glassStroke = c("#55FFB45A"),
        ),
        // Pure black, no glow: only the time and two buttons are lit (kindest to an OLED).
        AlarmTheme(
          id = "midnight", name = "Midnight",
          bgTop = c("#000000"), bgBottom = c("#000000"),
          orbs = emptyList(),
          timeFrom = c("#EBCB82"), timeTo = c("#B8832C"),
          text = c("#E9E5DC"), muted = c("#8D887F"), accent = c("#E2A84B"),
          buttonFrom = c("#E2A84B"), buttonTo = c("#E2A84B"), buttonText = c("#000000"),
          glass = c("#14FFFFFF"), glassStroke = c("#44E2A84B"),
        ),
        // The one light theme: warm ivory, deep gold numerals, a dark pill.
        AlarmTheme(
          id = "ivory", name = "Ivory",
          bgTop = c("#F8F2E6"), bgBottom = c("#E8DCC4"),
          orbs = listOf(
            Orb(c("#66E2A84B"), 0.86f, 0.08f, 1.00f),
            Orb(c("#99FFFFFF"), 0.10f, 0.80f, 0.95f),
          ),
          timeFrom = c("#B9791E"), timeTo = c("#6F4710"),
          text = c("#1B1710"), muted = c("#6F6554"), accent = c("#A9701C"),
          buttonFrom = c("#2B2319"), buttonTo = c("#12100C"), buttonText = c("#F6D38A"),
          glass = c("#66FFFFFF"), glassStroke = c("#66A9701C"),
          light = true,
        ),
        // Burnt orange and deep red, banked like a fire.
        AlarmTheme(
          id = "ember", name = "Ember",
          bgTop = c("#080304"), bgBottom = c("#140504"),
          orbs = listOf(
            Orb(c("#77C2410C"), 0.18f, 0.18f, 1.05f),
            Orb(c("#777F1D1D"), 0.92f, 0.72f, 1.05f),
            Orb(c("#44E2A84B"), 0.50f, 0.56f, 0.55f),
          ),
          timeFrom = c("#F6D38A"), timeTo = c("#D97A2B"),
          text = c("#F5EAE0"), muted = c("#B09A8E"), accent = c("#E2733B"),
          buttonFrom = c("#F6C58A"), buttonTo = c("#E2733B"), buttonText = c("#140504"),
          glass = c("#1FFFFFFF"), glassStroke = c("#55E2733B"),
        ),
      )
    }

    fun byId(id: String?): AlarmTheme = all.firstOrNull { it.id == id } ?: all.first()
  }
}
