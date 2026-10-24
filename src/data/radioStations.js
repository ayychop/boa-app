// Curated stations for every Radio genre pill: continuous music only, no
// talk, news or sports. Static so a genre loads instantly, without waiting on
// the radio-browser API.
//
// How these were picked (2026-10-21), for every candidate in each genre:
//  1. Stream rules: direct HTTPS MP3, no playlists/HLS, a stable URL (Zeno
//     streams use stream.zeno.fm/<mount>, never expiring token URLs).
//  2. Talk filter on name/tags (talk, news, sports, podcast, DJ set, live
//     show; for Gospel also preaching, sermons, ministry broadcasts).
//  3. Music test: the stream's live ICY "now playing" title read twice, a
//     minute apart. Kept only if both were "Artist - Song" (the second read
//     caught talk segments on several gospel stations, which are excluded).
//  4. Played in a real browser (reached `canplay`) and logo checked; a dead
//     logo is null so the app shows its generated label instead. Re-checked
//     2026-10-24: dead or missing logos were replaced from the station's own
//     site (og:image or touch icon) where one exists; the rest stay null and
//     the record and lock screen fall back to the BOA logo.
//
// Optional `brandColor` forces the glow behind a station's record when its
// logo can't be colour-extracted (dead logo, or one the browser can't read).
// Each entry notes the two titles it was playing.
//
// TODO: re-run the check periodically; internet stations change.

export const STATIONS_BY_GENRE = {
  // Afrobeats
  "afrobeats": [
    // sample  bounce -> Afro Melody Music - Sweet Me Tonight – Vibey Afrobeat Love Anthem (Offic
    { kind: "radio", id: "e31778fd-6e9b-4f18-9c55-e17068fa7b27", name: "Softlife Afrofusion Radio", streamUrl: "https://a10.asurahosting.com:7540/radio.mp3", logo: "https://forwardmystream.com/stations/300/softlifeafrofusionradio-6653.jpg", homepage: "https://sites.google.com/view/softlife-afrofusion-radio/home", country: "Nigeria", countryCode: "NG", tags: ["afro r&b", "afrobeats", "afrofusion", "amapioano", "love songs"], codec: "MP3", bitrate: 128, votes: 61, metadataVerified: true },
    // Rema - YAYO -> Juls  and  Victony - Saint Tropez
    { kind: "radio", id: "f195ceb3-2559-4494-bbd6-5847df8f4c89", name: "World Music Radio - Afrobeats", streamUrl: "https://streaming.exclusive.radio/er/afrobeats/icecast.audio", logo: "https://you.radio/cdn-cgi/image/width=400,quality=75/https://manager.uber.radio/static/uploads/station/53f05ae5-1fff-488d-a565-4644c4e47251.png", homepage: "https://play.you.radio/station/253", country: "The United Arab Emirates", countryCode: "AE", tags: ["afrobeat"], codec: "MP3", bitrate: 128, votes: 127, metadataVerified: true },
    // PHEELZ - Ballin ||  || S || 0f127a10-ba5b-4aed-b5d2-7ebabfdc8e75 -> TEMS - Damages ||  || 
    { kind: "radio", id: "8eed14e2-657e-4cac-b5ba-e0e9c4f1f38f", name: "Hotmix Afro Beats", streamUrl: "https://streaming.hotmixradio.com/hotmix-afro-en-mp3?provider=radiobrowser", logo: "https://cdn.hotmixradio.com/hotmix-afro-en-mp3.jpg", homepage: "https://hotmixradio.com/", country: "France", countryCode: "FR", tags: ["afro", "afrobeat", "afrobeats"], codec: "MP3", bitrate: 128, votes: 8, metadataVerified: true },
    // vetted for Trending
    { kind: "radio", id: "06d67d5b-00ad-4454-a86d-be41950f856a", name: "Asenteman Radio", streamUrl: "https://stream.zeno.fm/whaba8v8d4duv", logo: "https://cdn-profiles.tunein.com/s224923/images/bannerx.jpg?t=636808145780000000", homepage: "https://www.asantemanradioonline.com/", country: "Ghana", countryCode: "GH", tags: ["music"], codec: "MP3", bitrate: 96, votes: 14, metadataVerified: true },
    // Fior - Undercover Lover -> Fior - Undercover Lover
    { kind: "radio", id: "68ec09af-5b30-46b4-acf1-71400cf95892", name: "Power Ace Radio", streamUrl: "https://music-station.live/radio/8030/radio.mp3", logo: "https://www.poweraceradio.com/favicon.ico", homepage: "https://www.poweraceradio.com/", country: "The United Kingdom Of Great Britain And Northern Ireland", countryCode: "GB", tags: ["afrobeats", "easy listening", "jazz", "reggae", "reggaetón", "soul"], codec: "MP3", bitrate: 128, votes: 34, metadataVerified: true },
    // Young Jonn - Lalala (feat. Rema) -> Young Jonn - Lalala (feat. Rema)
    { kind: "radio", id: "1a9c8c79-2e17-11ea-aa0c-52543be04c81", name: "Urban Afro", streamUrl: "https://urbanhitblack.ice.infomaniak.ch/urbanhitblack128.mp3", logo: null, homepage: "https://www.urbanhit.fr/", country: "France", countryCode: "FR", tags: [], codec: "MP3", bitrate: 128, votes: 501, metadataVerified: true },
    // Quavo, T.I. - Backwards -> Quavo, T.I. - Backwards
    { kind: "radio", id: "034f7bb9-cf06-4dad-b9ae-2e48d7cff8d9", name: "Mix97FM", streamUrl: "https://panel.radiocast.net/listen/mix97fm/radio.mp3", logo: "https://files.catbox.moe/r5yc9a.png", homepage: "https://www.mix97fm.ca/", country: "Canada", countryCode: "CA", tags: ["afrobeats", "amapiano", "hip-hop", "reggae", "rnb"], codec: "MP3", bitrate: 192, votes: 0, metadataVerified: true },
  ],
  // Hip Hop
  "hip hop": [
    // vetted for Trending
    { kind: "radio", id: "dba1b7bc-6b92-409c-a543-8b42eec25636", name: "100 Hip Hop and RNB FM", streamUrl: "https://streaming.shoutcast.com/100-hip-hop-and-rnb-fm", logo: "https://static.mytuner.mobi/media/tvos_radios/887/rnb-and-hip-hop-radio.51c457d0.png", homepage: "https://uk.radio.net/s/100hiphopandrnb", country: "The United States Of America", countryCode: "US", tags: ["hip-hop", "rap hiphop rnb", "ridwan", "rnb"], codec: "MP3", bitrate: 128, votes: 413, metadataVerified: true },
    // vetted for Trending
    { kind: "radio", id: "b5ea4f76-4b5b-4313-b7b7-c07fc3cfc520", name: "Radio WoW Black", streamUrl: "https://sphera.fluidstream.eu/rwow_black.mp3", logo: "https://www.radiowow.com/wp-content/uploads/2025/03/radio-wow-logo-200x200.png", homepage: "https://radiowow.com/", country: "Italy", countryCode: "IT", tags: ["hiphop", "r&b", "rap", "soul"], codec: "MP3", bitrate: 192, votes: 102, metadataVerified: true },
    // BEYONCÉ - FORMATION -> BEYONCÉ - FORMATION
    { kind: "radio", id: "1623de65-2466-434c-ba04-ec075557f339", name: "I Love Radio Hip Hop", streamUrl: "https://streams.ilovemusic.de/iloveradio3.mp3", logo: "https://www.iloveradio.de/fileadmin/user_upload/ilm2025_ilovehiphop1x1_1_440x440.jpg", homepage: "https://www.ilovemusic.de/ilovehiphop.m3u", country: "Germany", countryCode: "DE", tags: [], codec: "MP3", bitrate: 192, votes: 747, metadataVerified: true },
    // Jalen Chords - My Boo -> Jalen Chords - My Boo
    { kind: "radio", id: "3cf973dd-94f2-4574-928d-380fa3f362c7", name: "Hot 108 JAMZ Radio", streamUrl: "https://live.powerhitz.com/hot108", logo: "https://hot108.com/content/wp-content/themes/hot108/images/logo.png", homepage: "http://www.hot108.com/", country: "The United States Of America", countryCode: "US", tags: [], codec: "MP3", bitrate: 128, votes: 88, metadataVerified: true },
    // Joe - If I Was Your Man -> Joe - If I Was Your Man
    { kind: "radio", id: "9b71a2f6-1c91-4242-baa1-fa750ef366e4", name: "GotRadio - OG's Hip Hop and RnB", streamUrl: "https://pureplay.cdnstream1.com/6045_128.mp3", logo: "https://cdn.onlineradiobox.com/img/l/5/10155.v2.png", homepage: "https://pureplay.cdnstream1.com/6045_128.mp3", country: "The United States Of America", countryCode: "US", tags: [], codec: "MP3", bitrate: 128, votes: 262, metadataVerified: true },
    // The Pharcyde - Passin' Me By -> The Pharcyde - Passin' Me By
    { kind: "radio", id: "93c6f7a5-fc79-4558-a20d-b53995f4b2bd", name: "Guarida Hip Hop", streamUrl: "https://stream.zeno.fm/ukum8z9cmvduv", logo: "https://zeno.fm/_ipx/q_100&fit_cover&s_160x160/https://images.zeno.fm/lwf05eR3ITaSNa-Of3DdYjFQVSuCS8nFZOOgEwP-iuw/rs:fill:256:256/g:ce:0:0/aHR0cHM6Ly9wcm94eS56ZW5vLmZtL2NvbnRlbnQvc3RhdGlvbnMvYWd4emZucGxibTh0YzNSaGRITnlNZ3NTQ2tGMWRHaERiR2xsYm5RWWdJQ0E0TEx3emdnTUN4SU9VM1JoZEdsdmJsQnliMlpwYkdVWWdJQ0FnSjNBbWdvTW9nRUVlbVZ1YncvaW1hZ2UvP3U9MTY5NTM1NjkzNzAwMA.webp", homepage: "https://www.guaridahiphop.com/", country: "Colombia", countryCode: "CO", tags: ["2000s", "90s", "classic hip hop", "hip-hop", "old school hip hop", "rap"], codec: "MP3", bitrate: 128, votes: 51, metadataVerified: true },
    // Elton John ft. Young Thug & Nicki Minaj - Always Love You -> Elton John ft. Young Thug & N
    { kind: "radio", id: "b0d16637-ef79-424d-ba06-68ca62615b79", name: "Hot Jamz Urban Radio", streamUrl: "https://stream02.dotpoint.nl:8030/stream", logo: "https://www.hotjamz.nl/wp-content/uploads/2018/03/cropped-hotjamz.png", homepage: "https://www.hotjamz.nl/", country: "The Netherlands", countryCode: "NL", tags: [], codec: "MP3", bitrate: 128, votes: 16, metadataVerified: true },
  ],
  // R&B
  "rnb": [
    // M.I.L.K. feat. KESMAR  - Everybody is a Summer Body -> Robert Glasper feat. Musiq Soulchil
    { kind: "radio", id: "c509f463-0b09-4b39-9ecc-96b6a77e3a71", name: "egoRNB", streamUrl: "https://streams.egofm.de/egoFMRNB-hq", logo: "https://streams.egofm.de/img/alexa/egoFM%20RNB-256x256.png", homepage: "https://www.egofm.de/streams/egofmrnb", country: "Germany", countryCode: "DE", tags: ["egofm", "r&b", "rhythm and blues", "rnb"], codec: "MP3", bitrate: 128, votes: 48, metadataVerified: true },
    // vetted for Trending
    { kind: "radio", id: "afb31087-30b4-44c7-8469-b3526d8f3bb5", name: "Total Soul (UK)", streamUrl: "https://onair7.xdevel.com/proxy/xautocloud_atvn_1069?mp=/;1/", logo: "https://mmo.aiircdn.com/440/66d2d8d6d54ea.png", homepage: "https://www.totalsoul.co.uk/", country: "The United Kingdom Of Great Britain And Northern Ireland", countryCode: "GB", tags: ["80's", "disco", "soul"], codec: "MP3", bitrate: 192, votes: 187, metadataVerified: true },
    // Curtis Mayfield - The Girl I Find Stays On My Mind -> Curtis Mayfield - The Girl I Find St
    { kind: "radio", id: "526fbc3c-ab09-4f71-a42c-e896dcddcc13", name: "Exclusively Curtis Mayfield", streamUrl: "https://2.mystreaming.net/er/curtismayfield/icecast.audio", logo: "https://you.radio/cdn-cgi/image/width=400,quality=75/https://manager.uber.radio/static/uploads/station/07f6aae5-5bfc-4afa-9f0a-2f43385b0790.jpg", homepage: "https://play.you.radio/station/145", country: "The United Arab Emirates", countryCode: "AE", tags: ["funk", "gospel", "progressive soul", "psychedelic soul", "r&b", "singer-songwriter"], codec: "MP3", bitrate: 128, votes: 44, metadataVerified: true },
    // Earth, Wind  and  Fire - Devotion -> Earth, Wind  and  Fire - Devotion
    { kind: "radio", id: "a2d85de7-3b0e-498c-8b49-629adb60495c", name: "Exclusively Earth, Wind & Fire", streamUrl: "https://nl4.mystreaming.net/er/earthwindandfire/icecast.audio", logo: "https://you.radio/cdn-cgi/image/width=400,quality=75/https://manager.uber.radio/static/uploads/station/36f022c1-8177-4966-ad76-4933888ef846.jpg", homepage: "https://play.you.radio/station/147", country: "The United Arab Emirates", countryCode: "AE", tags: ["disco", "funk", "pop", "progressive soul", "r&b", "soul"], codec: "MP3", bitrate: 128, votes: 71, metadataVerified: true },
    // vetted for Trending
    { kind: "radio", id: "dba1b7bc-6b92-409c-a543-8b42eec25636", name: "100 Hip Hop and RNB FM", streamUrl: "https://streaming.shoutcast.com/100-hip-hop-and-rnb-fm", logo: "https://static.mytuner.mobi/media/tvos_radios/887/rnb-and-hip-hop-radio.51c457d0.png", homepage: "https://uk.radio.net/s/100hiphopandrnb", country: "The United States Of America", countryCode: "US", tags: ["hip-hop", "rap hiphop rnb", "ridwan", "rnb"], codec: "MP3", bitrate: 128, votes: 413, metadataVerified: true },
    // Joe - If I Was Your Man -> Joe - If I Was Your Man
    { kind: "radio", id: "9b71a2f6-1c91-4242-baa1-fa750ef366e4", name: "GotRadio - OG's Hip Hop and RnB", streamUrl: "https://pureplay.cdnstream1.com/6045_128.mp3", logo: "https://cdn.onlineradiobox.com/img/l/5/10155.v2.png", homepage: "https://pureplay.cdnstream1.com/6045_128.mp3", country: "The United States Of America", countryCode: "US", tags: [], codec: "MP3", bitrate: 128, votes: 262, metadataVerified: true },
  ],
  // Amapiano
  "amapiano": [
    // Dj Kench - Groove To The Beat 3 - Amapiano Mix 2025 ft Dj Maphorisa, Ngibolekeni, Uyah, Bo
    { kind: "radio", id: "cf477514-6fc0-446b-adf2-d252dba5ee75", name: "Amapiano FM", streamUrl: "https://stream.zeno.fm/xs6zeac1ts8uv", logo: "https://cdn.webrad.io/images/logos/radiosa-org/amapiano.png", homepage: "https://radiosa.org/amapiano/", country: "South Africa", countryCode: "ZA", tags: ["amapiano"], codec: "MP3", bitrate: 128, votes: 793, metadataVerified: true },
    // vetted for Trending
    { kind: "radio", id: "9212435f-2b7f-4576-a6f8-6722ea5ffaac", name: "Southside Stereo", streamUrl: "https://radio.southsidestereo.co.za/listen/southsidestereo/radio.mp3", logo: "https://southsidestereo.co.za/logo.png", homepage: "https://southsidestereo.co.za/", country: "South Africa", countryCode: "ZA", tags: ["afrobeats", "amapiano", "electronic", "hip hop", "johannesburg", "kwaito"], codec: "MP3", bitrate: null, votes: 5, metadataVerified: true },
    // vetted for Trending
    { kind: "radio", id: "d529453c-08b3-42bb-bb65-4e95b43c9178", name: "InterSpace Sound System", streamUrl: "https://radio.interspacemusic.com/stream.mp3", logo: "https://radio.interspacemusic.com/assets/iss-logo.png", homepage: "https://radio.interspacemusic.com/", country: "Nigeria", countryCode: "NG", tags: ["african", "afro house", "afrobeats", "amapiano", "club", "dance"], codec: "MP3", bitrate: null, votes: 25, metadataVerified: true },
    // sample  bounce -> Afro Melody Music - Sweet Me Tonight – Vibey Afrobeat Love Anthem (Offic
    { kind: "radio", id: "e31778fd-6e9b-4f18-9c55-e17068fa7b27", name: "Softlife Afrofusion Radio", streamUrl: "https://a10.asurahosting.com:7540/radio.mp3", logo: "https://forwardmystream.com/stations/300/softlifeafrofusionradio-6653.jpg", homepage: "https://sites.google.com/view/softlife-afrofusion-radio/home", country: "Nigeria", countryCode: "NG", tags: ["afro r&b", "afrobeats", "afrofusion", "amapioano", "love songs"], codec: "MP3", bitrate: 128, votes: 61, metadataVerified: true },
    // Quavo, T.I. - Backwards -> Quavo, T.I. - Backwards
    { kind: "radio", id: "034f7bb9-cf06-4dad-b9ae-2e48d7cff8d9", name: "Mix97FM", streamUrl: "https://panel.radiocast.net/listen/mix97fm/radio.mp3", logo: "https://files.catbox.moe/r5yc9a.png", homepage: "https://www.mix97fm.ca/", country: "Canada", countryCode: "CA", tags: ["afrobeats", "amapiano", "hip-hop", "reggae", "rnb"], codec: "MP3", bitrate: 192, votes: 0, metadataVerified: true },
  ],
  // Dancehall
  "dancehall": [
    // Sizzla - Sizzla - Wanting You -> - 20-Comforter - Morgan`s Heritage
    { kind: "radio", id: "d9d78c50-3766-4e74-8f67-1cd7d878f2f4", name: "Ghetto Vibes Radio", brandColor: "#D81B60", streamUrl: "https://www.radioking.com/play/ghetto-vibes-radio-station", logo: null, homepage: "https://app.site123.com/manager/wizard.php?wu=6293042d3b4b8-6293042d3b4f3-6293042d3b52d&from=dash#", country: "Jamaica", countryCode: "JM", tags: ["classic soul", "dancehall", "roots reggae", "soca"], codec: "MP3", bitrate: 128, votes: 1193, metadataVerified: true },
    // Wayne Wonder - Sensimedia Radio -> Moyann - Likkle Miss Riding Hood
    { kind: "radio", id: "49da007a-d18c-4f03-b3ba-f1934079facc", name: "Sensimedia Dancehall Radio", streamUrl: "https://sensidancehall.radioca.st/;", logo: "https://sensimedia.net/images/cards/radio.general.png", homepage: "http://sensi.media/dancehallradio", country: "The United States Of America", countryCode: "US", tags: ["dancehall", "dub", "reggae"], codec: "MP3", bitrate: 192, votes: 6, metadataVerified: true },
    // I-Octane - Party Start -> I-Octane - Party Start
    { kind: "radio", id: "208e60b9-2075-435a-9506-9787ef30928c", name: "RauteMusik Caribbean Wave", streamUrl: "https://streams.rautemusik.fm/caribbean-wave/mp3-192/?ref=radiobrowser", logo: "https://i.ibb.co/nL15LGH/cw.jpg", homepage: "https://www.rm.fm/caribbean-wave", country: "Germany", countryCode: "DE", tags: ["afro", "afro-latin music", "afro-pop", "afrobeats", "caribbean", "caribbean music"], codec: "MP3", bitrate: 192, votes: 132, metadataVerified: true },
    // Judah Tribe - Wild Locust & Honey -> Judah Tribe - Wild Locust & Honey
    { kind: "radio", id: "1c49165c-70f5-4ef7-8743-633a0cdc6b5d", name: "Riddim Radio", streamUrl: "https://stream.zeno.fm/nw7xmuzasyduv", logo: "https://riddimradio.com/uploads/6706d00312d96/site/1777217627_ef6f0bae49c0311848c7.png", homepage: "https://riddimradio.com/", country: "Belize", countryCode: "BZ", tags: ["reggae"], codec: "MP3", bitrate: 128, votes: 28, metadataVerified: true },
    // Soul Rebel Project ft Green Lion Crew & Lion Fiyah - Medi (Dirty) -> Soul Rebel Project ft
    { kind: "radio", id: "4a091030-84e1-4195-a312-33304c76565b", name: "Simply Irie", streamUrl: "https://s6.autopo.st/proxy/simplyradio5?mp=/stream", logo: "https://simplyradio.com/og-beta101.png?v=20260908", homepage: "https://simplyradio.com/stations/irie/", country: "The United States Of America", countryCode: "US", tags: ["dancehall", "reggae"], codec: "MP3", bitrate: 128, votes: 0, metadataVerified: true },
  ],
  // Reggae
  "reggae": [
    // CHRONIXX - Start A Fyah ||  || S || 94c46669-3e5b-4764-b91c-ad2d795e18a9 -> MELLOW MOOD - 
    { kind: "radio", id: "ecb13e96-8465-4863-8188-a0866c783ae9", name: "Hotmix Reggae", streamUrl: "https://streaming.hotmixradio.com/hotmix-reggae-en-mp3?provider=radiobrowser", logo: "https://cdn.hotmixradio.com/hotmix-reggae-en-mp3.jpg", homepage: "https://hotmixradio.com/", country: "France", countryCode: "FR", tags: ["reggae", "roots reggae", "smooth reggae"], codec: "MP3", bitrate: 128, votes: 10, metadataVerified: true },
    // Alpha Blondy - Coco de Rasta -> Alpha Blondy - Coco de Rasta
    { kind: "radio", id: "bb904f3c-d4c8-4012-8432-70be72c81186", name: "1 Reggae Joint", streamUrl: "https://jointil.com/stream-reggae", logo: "https://www.jointil.com/broadcast/images/joint.radio330X330.png", homepage: "https://www.jointil.com/radio/", country: "Germany", countryCode: "DE", tags: ["dub", "dub reggae", "reggae", "reggeton", "roots reggae", "smooth reggae"], codec: "MP3", bitrate: 320, votes: 411, metadataVerified: true },
    // Horace Andy - Love of a Woman -> Cocoa Tea - Good Life
    { kind: "radio", id: "9fb8627d-6f09-41e7-a13e-72a746cc9455", name: "Love Radio - Reggae", streamUrl: "https://drive.uber.radio/uber/lrreggae/icecast.audio", logo: null, homepage: "https://loveradio.love/", country: "The United Arab Emirates", countryCode: "AE", tags: ["pop", "reggae"], codec: "MP3", bitrate: 128, votes: 73, metadataVerified: true },
    // Med Tone All Stars - Rootical Skank -> Dudley Sibley & The Soul Gang - Love In Our Nation
    { kind: "radio", id: "6304532a-d3c9-4633-a85d-cf6c5c77524a", name: "Ruffneck Smille", streamUrl: "https://ruffneck-smille.stream.laut.fm/ruffneck-smille", logo: "https://assets.laut.fm/b542a9bc43da2edcec23dd4d7f71e3f6?t=_120x120", homepage: "https://laut.fm/ruffneck-smille", country: "Germany", countryCode: "DE", tags: ["reggae", "rocksteady", "ska"], codec: "MP3", bitrate: 128, votes: 2, metadataVerified: true },
    // Soul Rebel Project ft Green Lion Crew & Lion Fiyah - Medi (Dirty) -> Soul Rebel Project ft
    { kind: "radio", id: "4a091030-84e1-4195-a312-33304c76565b", name: "Simply Irie", streamUrl: "https://s6.autopo.st/proxy/simplyradio5?mp=/stream", logo: "https://simplyradio.com/og-beta101.png?v=20260908", homepage: "https://simplyradio.com/stations/irie/", country: "The United States Of America", countryCode: "US", tags: ["dancehall", "reggae"], codec: "MP3", bitrate: 128, votes: 0, metadataVerified: true },
  ],
  // Jazz
  "jazz": [
    // Nils - Chill It -> 3rd Force - Time for Wonderful
    { kind: "radio", id: "0eb3dbcf-05f7-480e-83f4-7718102a4820", name: "SmoothJazz.com", streamUrl: "https://smoothjazz.cdnstream1.com/2585_128.mp3", logo: "https://www.smoothjazz.com/sites/default/files/theme/sj-circle-logo.png", homepage: "https://www.smoothjazz.com/", country: "The United States Of America", countryCode: "US", tags: ["monterey", "smooth jazz"], codec: "MP3", bitrate: 128, votes: 6732, metadataVerified: true },
    // Dan Fogelberg/Tim Weisberg - Guitar Etude No. 3 -> Dan Fogelberg/Tim Weisberg - Guitar Etu
    { kind: "radio", id: "615fe9a1-b87f-463e-bfdf-dd8ceb040bc4", name: "Smooth Jazz Florida", streamUrl: "https://streaming.live365.com/a57422", logo: "https://img1.wsimg.com/isteam/ip/93edd3ac-b031-446a-99c8-fe88e7f00e40/smooth%20jazz%20logo%2012-20-2013%201400X1400%20(20-0002.png", homepage: "https://smoothjazzflorida.com/", country: "The United States Of America", countryCode: "US", tags: ["smooth jazz"], codec: "MP3", bitrate: 192, votes: 731, metadataVerified: true },
    // Quincy Jones (With Brandy & Heavy D) - Rock With You -> Quincy Jones (With Brandy & Heavy 
    { kind: "radio", id: "9be83992-a630-43e6-8437-a49d90946352", name: "Jazzy Groove", streamUrl: "https://radio.musorok.org/listen/jazzygroove/jazzygroove.mp3", logo: "https://jazzy-backend-prod.melkweg.hu/jazzy-borito-fallback-groove.jpg", homepage: "https://jazzy.hu/", country: "Hungary", countryCode: "HU", tags: ["groove", "smooth jazz"], codec: "MP3", bitrate: 192, votes: 545, metadataVerified: true },
    // Bronner Till - The Peacocks -> Bronner Till - The Peacocks
    { kind: "radio", id: "518d02e0-9301-4358-bf25-4ed57372fd2d", name: "Instrumental Jazz", streamUrl: "https://jfm1.hostingradio.ru:14536/ijstream.mp3", logo: "https://radiojazzfm.ru/favicons/apple-touch-icon.png", homepage: "https://radiojazzfm.ru/", country: "The Russian Federation", countryCode: "RU", tags: ["instrumental", "jazz"], codec: "MP3", bitrate: 128, votes: 6359, metadataVerified: true },
    // Frank Sinatra - America The Beautiful -> Frank Sinatra - Moonlight Mood
    { kind: "radio", id: "392993a8-7601-4d2f-bda7-c6798406db1b", name: "Exclusively Frank Sinatra", streamUrl: "https://2.mystreaming.net/er/franksinatra/icecast.audio", logo: "https://you.radio/cdn-cgi/image/width=400,quality=75/https://manager.uber.radio/static/uploads/station/c1dddbeb-24eb-4f77-8fe4-594956fc5c68.jpg", homepage: "https://play.you.radio/station/384", country: "The United Arab Emirates", countryCode: "AE", tags: ["big band", "standards", "swing"], codec: "MP3", bitrate: 128, votes: 615, metadataVerified: true },
    // Eddie Gomez - Mode VI -> Eddie Gomez - Mode VI
    { kind: "radio", id: "de4af2f0-6262-455c-9bd2-d44f1235bb6b", name: "Radio Art - Smooth Jazz", streamUrl: "https://live.radioart.com/fSmooth_jazz.mp3", logo: "https://www.radioart.com/images/channels/Smooth_jazz.jpg", homepage: "https://www.radioart.com/", country: "Greece", countryCode: "GR", tags: ["jazz", "music", "smooth", "smooth jazz"], codec: "MP3", bitrate: 96, votes: 148, metadataVerified: true },
    // Dr. Sax Love - Where's The Love -> Dr. Sax Love - Where's The Love
    { kind: "radio", id: "c7d6315c-3bcd-40f6-a1b5-4bc1c8efecee", name: "Tropical Smooth Jazz", streamUrl: "https://servidor32-3.brlogic.com:8230/live", logo: "https://platform-upload.cdn-brlogic.com/47137/fbplayer/e57eba87f9840b88b9f3db116416aebe.png", homepage: "https://tropicalsmoothjazz.com/", country: "Brazil", countryCode: "BR", tags: ["jazz", "smooth jazz", "suave"], codec: "MP3", bitrate: 128, votes: 817, metadataVerified: true },
  ],
  // Gospel
  "gospel": [
    // Paul-Emmanuel, Monaze - Power! -> Da Voice, Hiro Lyon - My Gain
    { kind: "radio", id: "536669d5-9b8e-4d4d-b462-caf9fdb9ab2a", name: "Afrobeats Gospel Radio", streamUrl: "https://stream.zeno.fm/zyd9stmdlnlvv", logo: "https://zeno.fm/_next/image/?url=https%3A%2F%2Fimages.zeno.fm%2FQQP3mGmsJ7eRVncsKMUkgNRs9dp4BsOgbjYSpFqWLZs%2Frs%3Afit%3A320%3A320%2Fg%3Ace%3A0%3A0%2FaHR0cHM6Ly96ZW5vaW1hZ2VzLnMzLnVzLXdlc3QtMDAxLmJhY2tibGF6ZWIyLmNvbS9kYmJlZWM3Yy1hZjBmLTQwYzMtOWUxYS1hMTMxYTM3ZmU2ZjEvY2FyZHMvZjAzZjc4NzgtNjk4MS00OTMyLWJiYzktZjU4NmI3MTRiNmIwP3U9NTc1OTE3OA.webp&w=1080&q=75", homepage: "https://www.afrobeatsgospel.com/", country: "Nigeria", countryCode: "NG", tags: ["african", "afrobeats", "christian", "gospel", "inspirational"], codec: "MP3", bitrate: 128, votes: 967, metadataVerified: true },
    // Mercy Me - Then Christ Came -> Mercy Me - Then Christ Came
    { kind: "radio", id: "761e6b5a-a70f-44d2-8bd5-85ec54040395", name: "CRnet Power Praise", streamUrl: "https://shoutcast.christianrock.net/stream/7/", logo: "https://www.christianpowerpraise.net/apple-touch-icon.png", homepage: "https://www.christianpowerpraise.net/", country: "The United States Of America", countryCode: "US", tags: ["christian", "power praise", "praise"], codec: "MP3", bitrate: 128, votes: 40, metadataVerified: true },
    // Forrest Frank - Somebody Prayed (feat. Tate Butts) -> Steven Malcolm - Cardio
    { kind: "radio", id: "1759b890-4403-4125-b232-c2b8aa6b6392", name: "Christian Hits", streamUrl: "https://shoutcast.christianrock.net/stream/5/", logo: "https://www.christianhits.net/apple-touch-icon.png", homepage: "https://www.christianhits.net/", country: "The United States Of America", countryCode: "US", tags: ["christian", "christian praise&worship", "christianpowerpraise.net", "modern praise", "power praise", "praise"], codec: "MP3", bitrate: 128, votes: 479, metadataVerified: true },
    // Mark Schultz - He's My Son -> Sapphire Singers - We Will Stand
    { kind: "radio", id: "6e9e7d87-49c1-4fc0-a9e8-b73b8871c3c9", name: "3ABN Radio Music Channel", streamUrl: "https://war.streamguys1.com:7185/MC01", logo: "https://3abn.org/img/logos/radio/3abn-radio-music-channel.png", homepage: "https://3abn.org/", country: "The United States Of America", countryCode: "US", tags: ["gospel"], codec: "MP3", bitrate: 128, votes: 161, metadataVerified: true },
    // The LeFevre Quartet - Whatever Hallelujah -> The Perrys - Blue Skies Coming
    { kind: "radio", id: "dabe2161-c6fc-4236-9795-79fd6ba13f6b", name: "REAL Southern Gospel Radio!", streamUrl: "https://streaming.live365.com/a82162", logo: "https://i.ibb.co/DPYvPhkv/1b9312ac-15c4-4b56-801e-6889205d2999.png", homepage: "https://realsoutherngospel.com/", country: "The United States Of America", countryCode: "US", tags: ["bluegrass gospel", "southern gospel"], codec: "MP3", bitrate: 320, votes: 6, metadataVerified: true },
    // JOE METTLE - NYA GYIDI (HAVE FAITH) -> JOE METTLE - NYA GYIDI (HAVE FAITH)
    { kind: "radio", id: "40507470-ace1-4637-8548-8173d9aaa3df", name: "Air Gospel", streamUrl: "https://stream.zeno.fm/qkgrhugy908uv", logo: null, homepage: "https://airtv.world/", country: "Nigeria", countryCode: "NG", tags: [], codec: "MP3", bitrate: 128, votes: 213, metadataVerified: true },
    // James Wilson - Hallelujah -> James Wilson - Hallelujah
    { kind: "radio", id: "d8a39607-5d36-4ccf-a1cb-bff53ea3109a", name: "Trace Gospel", streamUrl: "https://c25.radioboss.fm:8130/4rm8tzo7qirtv", logo: "https://www.trace.tv/icons/icon-512x512.png", homepage: "https://c25.radioboss.fm:8130/4rm8tzo7qirtv", country: "Uganda", countryCode: "UG", tags: ["religious"], codec: "MP3", bitrate: 192, votes: 168, metadataVerified: true },
  ],
};


// Backups, swapped in (same slot) when a curated station turns out to be
// dead this session. Every one passed the same music, playback and logo
// checks as the main lists but didn't make the cut.
export const BACKUP_STATIONS_BY_GENRE = {
  "afrobeats": [
    // music-verified
    { kind: "radio", id: "d529453c-08b3-42bb-bb65-4e95b43c9178", name: "InterSpace Sound System", streamUrl: "https://radio.interspacemusic.com/stream.mp3", logo: "https://radio.interspacemusic.com/assets/iss-logo.png", homepage: "https://radio.interspacemusic.com/", country: "Nigeria", countryCode: "NG", tags: ["african", "afro house", "afrobeats", "amapiano", "club", "dance"], codec: "MP3", bitrate: null, votes: 25, metadataVerified: true },
    // DJ Latet - DJ Latet – Ghana Gospel Mix (20212022) -> DJ Latet - DJ Latet – Ghana Gospel Mi
    { kind: "radio", id: "db6792db-3a8c-4423-bf5f-bc9b0cc571c2", name: "HANA Radio", streamUrl: "https://stream.zeno.fm/qqaz1l2tujvuv", logo: "https://zeno.fm/_ipx/_/https://images.zeno.fm/ZJi8coXweWDKG7VUcdAJu3KuHmsSVONFWitoowmeeV4/rs:fill:2048:512/g:ce:0:0/aHR0cHM6Ly9wcm94eS56ZW5vLmZtL2NvbnRlbnQvc3RhdGlvbnMvMDhiYjljMDQtZjNjOS00NjY3LTk0YzQtYjgwNTU5OGJkNmYzL21pY3Jvc2l0ZS9iYWNrZ3JvdW5kX2ltYWdlLz91PTE3NDcwNjk2NDgwMDA.webp", homepage: "https://zeno.fm/radio/hana-radio-1utb/", country: "Ghana", countryCode: "GH", tags: [], codec: "MP3", bitrate: 128, votes: 160, metadataVerified: true },
  ],
  "hip hop": [
    // music-verified
    { kind: "radio", id: "15ad7a63-dd62-479c-8608-c53922dbc8b5", name: "Base FM", streamUrl: "https://icast.connectmedia.hu/5401/live.mp3", logo: "https://basefm.hu/wp-content/themes/basefm/assets/dist/img/favicon/apple-icon-120x120.png", homepage: "https://basefm.hu/", country: "Hungary", countryCode: "HU", tags: ["hiphop", "rap", "rnb"], codec: "MP3", bitrate: 320, votes: 1381, metadataVerified: true },
    // Artie 5ive - SWAG MUSIC -> Artie 5ive - SWAG MUSIC
    { kind: "radio", id: "87d9091c-5560-4cd8-8a7b-b00b11b98f2d", name: "Urban Radio", streamUrl: "https://nr3.newradio.it:18100/stream", logo: "https://urbanradio.it/wp-content/uploads/2022/05/cropped-favicon-180x180.png", homepage: "https://www.urbanradio.it/", country: "Italy", countryCode: "IT", tags: ["hiphop", "rap", "reggae", "reggaeton", "trap", "urban contemporary"], codec: "MP3", bitrate: 192, votes: 89, metadataVerified: true },
    // xxxtentacion - looking for a star (alucvrd flip) -> xxxtentacion - looking for a star (alu
    { kind: "radio", id: "89c307c8-626a-4af8-aae1-c332b6492f3a", name: "Fed's Trap Radio", streamUrl: "https://backend.fedstrapradio.com:8000/radio.mp3", logo: "https://fedstrapradio.com/img/apple-touch-icon.png", homepage: "https://fedstrapradio.com/", country: "Czechia", countryCode: "CZ", tags: ["trap"], codec: "MP3", bitrate: 192, votes: 79, metadataVerified: true },
  ],
  "rnb": [
    // music-verified
    { kind: "radio", id: "15ad7a63-dd62-479c-8608-c53922dbc8b5", name: "Base FM", streamUrl: "https://icast.connectmedia.hu/5401/live.mp3", logo: "https://basefm.hu/wp-content/themes/basefm/assets/dist/img/favicon/apple-icon-120x120.png", homepage: "https://basefm.hu/", country: "Hungary", countryCode: "HU", tags: ["hiphop", "rap", "rnb"], codec: "MP3", bitrate: 320, votes: 1381, metadataVerified: true },
    // Sugar On My Tongue - Tyler, The Creator -> Sugar On My Tongue - Tyler, The Creator
    { kind: "radio", id: "23687de7-9621-4e09-b190-1f83fd626906", name: "RMF 4 Dance & RnB", streamUrl: "https://rs6-krk2.rmfstream.pl/rmf_4", logo: "https://www.rmfon.pl/assets/images/favicon/apple-touch-icon.png", homepage: "https://www.rmfon.pl/play,96", country: "Poland", countryCode: "PL", tags: ["dance", "r&b"], codec: "MP3", bitrate: 128, votes: 189, metadataVerified: true },
    // Chic - My Feet Keep Dancing -> Chic - My Feet Keep Dancing
    { kind: "radio", id: "87fa97b5-38e7-42d2-9095-dc401f9fb597", name: "Exclusively Chic", streamUrl: "https://nl4.mystreaming.net/er/chic/icecast.audio", logo: "https://you.radio/cdn-cgi/image/width=400,quality=75/https://manager.uber.radio/static/uploads/station/e59b9825-f3e9-4bb7-83c6-63e9febfc7ad.jpg", homepage: "https://play.you.radio/station/144", country: "The United Arab Emirates", countryCode: "AE", tags: ["disco", "funk", "r&b", "rock"], codec: "MP3", bitrate: 128, votes: 113, metadataVerified: true },
  ],
  "amapiano": [
    // Salif Keita, Caiiro - Madan -> Salif Keita, Caiiro - Madan
    { kind: "radio", id: "6c42ddb1-c003-4a72-b62f-f33590e6f765", name: "Five FM Romania", streamUrl: "https://c22.radioboss.fm:8700/stream", logo: "https://5fm.ro/wp-content/uploads/2026/08/cropped-5fm-dark-blue-2026-beta2-192x192.png", homepage: "https://5fm.ro/", country: "Romania", countryCode: "RO", tags: ["afro house", "deep house", "electronic", "house", "melodic house", "progressive house"], codec: "MP3", bitrate: 320, votes: 4, metadataVerified: true },
  ],
  "dancehall": [
    // CHRONIXX - Start A Fyah ||  || S || 94c46669-3e5b-4764-b91c-ad2d795e18a9 -> MELLOW MOOD - 
    { kind: "radio", id: "ecb13e96-8465-4863-8188-a0866c783ae9", name: "Hotmix Reggae", streamUrl: "https://streaming.hotmixradio.com/hotmix-reggae-en-mp3?provider=radiobrowser", logo: "https://cdn.hotmixradio.com/hotmix-reggae-en-mp3.jpg", homepage: "https://hotmixradio.com/", country: "France", countryCode: "FR", tags: ["reggae", "roots reggae", "smooth reggae"], codec: "MP3", bitrate: 128, votes: 10, metadataVerified: true },
    // Alpha Blondy - Coco de Rasta -> Alpha Blondy - Coco de Rasta
    { kind: "radio", id: "bb904f3c-d4c8-4012-8432-70be72c81186", name: "1 Reggae Joint", streamUrl: "https://jointil.com/stream-reggae", logo: "https://www.jointil.com/broadcast/images/joint.radio330X330.png", homepage: "https://www.jointil.com/radio/", country: "Germany", countryCode: "DE", tags: ["dub", "dub reggae", "reggae", "reggeton", "roots reggae", "smooth reggae"], codec: "MP3", bitrate: 320, votes: 411, metadataVerified: true },
  ],
  "reggae": [
    // I-Octane - Party Start -> I-Octane - Party Start
    { kind: "radio", id: "208e60b9-2075-435a-9506-9787ef30928c", name: "RauteMusik Caribbean Wave", streamUrl: "https://streams.rautemusik.fm/caribbean-wave/mp3-192/?ref=radiobrowser", logo: "https://i.ibb.co/nL15LGH/cw.jpg", homepage: "https://www.rm.fm/caribbean-wave", country: "Germany", countryCode: "DE", tags: ["afro", "afro-latin music", "afro-pop", "afrobeats", "caribbean", "caribbean music"], codec: "MP3", bitrate: 192, votes: 132, metadataVerified: true },
    // Sizzla - Sizzla - Wanting You -> - 20-Comforter - Morgan`s Heritage
    { kind: "radio", id: "d9d78c50-3766-4e74-8f67-1cd7d878f2f4", name: "Ghetto Vibes Radio", brandColor: "#D81B60", streamUrl: "https://www.radioking.com/play/ghetto-vibes-radio-station", logo: null, homepage: "https://app.site123.com/manager/wizard.php?wu=6293042d3b4b8-6293042d3b4f3-6293042d3b52d&from=dash#", country: "Jamaica", countryCode: "JM", tags: ["classic soul", "dancehall", "roots reggae", "soca"], codec: "MP3", bitrate: 128, votes: 1193, metadataVerified: true },
  ],
  "jazz": [
    // Dynamique - Love Hatin' -> Dynamique - Love Hatin'
    { kind: "radio", id: "91756e93-9895-4d6e-830f-4703ae943c20", name: "Jazzy Soul", streamUrl: "https://radio.musorok.org/listen/jazzysoul/jazzysoul.mp3", logo: "https://jazzy-backend-prod.melkweg.hu/jazzy-borito-fallback-soul.jpg", homepage: "https://jazzy.hu/", country: "Hungary", countryCode: "HU", tags: ["jazz", "smooth jazz", "soul"], codec: "MP3", bitrate: 192, votes: 244, metadataVerified: true },
    // Allan Harris - I  Let A Song Get Out Of My .. -> Allan Harris - I  Let A Song Get Out Of M
    { kind: "radio", id: "a0481653-b63d-4ae2-9df3-0684c3313af6", name: "Jazzy Cool", streamUrl: "https://radio.musorok.org/listen/jazzycool/jazzycool.mp3", logo: "https://jazzy-backend-prod.melkweg.hu/jazzy-borito-fallback-cool.jpg", homepage: "https://jazzy.hu/", country: "Hungary", countryCode: "HU", tags: ["jazz", "smooth jazz"], codec: "MP3", bitrate: 192, votes: 215, metadataVerified: true },
    // Anders Ponsaing / Claus Højensgård - The Man with the Red Face -> DJ Maretimo - Cafe Inter
    { kind: "radio", id: "02569932-0b3c-4938-9d3e-b00b2158d40b", name: "Airport Lounge Radio", streamUrl: "https://az1.mediacp.eu/listen/airport-lounge-radio/radio.mp3", logo: null, homepage: "https://radiosuitenetwork.torontocast.stream/airport-lounge-radio/", country: "Canada", countryCode: "CA", tags: ["aereoporto", "airport", "ambient", "chill", "chillout", "easy listening"], codec: "MP3", bitrate: 128, votes: 2316, metadataVerified: true },
  ],
  "gospel": [
    // MASTER`S PROMISE - PREPARE YE THE WAY(2017) -> LESTERS - HIS REDEEMED (2013)
    { kind: "radio", id: "cae26fec-7184-4e70-80d4-9dd166837599", name: "Affirm Southern Gospel Radio", streamUrl: "https://ais-sa2.cdnstream1.com/1708_128", logo: "https://assets.zyrosite.com/cdn-cgi/image/format=auto,w=1224,h=88,fit=crop/YbNDJoO6N1cK0J3N/affirm-logo-dWxMLpPvKOcn2bww.png", homepage: "https://affirmsoutherngospelradio.com/", country: "The United States Of America", countryCode: "US", tags: ["southern gospel"], codec: "MP3", bitrate: 128, votes: 66, metadataVerified: true },
    // Reyer & Reni Kraayenoord - Kennen -> Reyer & Reni Kraayenoord - Kennen
    { kind: "radio", id: "466c6af1-bb23-4d42-8509-3fb73d872a14", name: "Groot Nieuws Radio Non-Stop", streamUrl: "https://playerservices.streamtheworld.com/api/livestream-redirect/GNRNONSTOP.mp3", logo: "https://images.cvandaag.nl/artikel-foto/0fdee9961e3678d8bd55c560ea6f0384/groot-nieuws-radio.png", homepage: "https://www.grootnieuwsradio.nl/", country: "The Netherlands", countryCode: "NL", tags: ["non-stop", "worship"], codec: "MP3", bitrate: 192, votes: 99, metadataVerified: true },
  ],
};

/** The curated list for a genre tag, or null if the genre isn't curated. */
export function curatedStations(tag) {
  return STATIONS_BY_GENRE[tag] ?? null;
}

/** Backup stations for a genre, in the order to swap them in. */
export function backupStations(tag) {
  return BACKUP_STATIONS_BY_GENRE[tag] ?? [];
}
