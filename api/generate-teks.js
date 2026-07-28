// api/generate-teks.js
// Serverless function (Vercel) — proxy aman ke Google Gemini API.
// API key disimpan di Environment Variable server (GEMINI_API_KEY), TIDAK pernah
// dikirim ke browser. Model juga bisa dioverride lewat env var GEMINI_MODEL
// tanpa perlu ubah kode, karena Google cukup sering mengganti nama model gratis.

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Metode tidak diizinkan.' });
    return;
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    res.status(500).json({
      error: 'GEMINI_API_KEY belum diatur di Vercel Environment Variables. Tambahkan dulu di Settings → Environment Variables, lalu redeploy.'
    });
    return;
  }

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch (e) { body = {}; }
  }
  const jenjang = (body && body.jenjang || '').toString().trim();
  const topik = (body && body.topik || '').toString().trim();
  const panjang = (body && body.panjang || 'sedang').toString().trim();

  if (!jenjang || !topik) {
    res.status(400).json({ error: 'Jenjang dan topik wajib diisi.' });
    return;
  }
  if (topik.length > 120) {
    res.status(400).json({ error: 'Topik terlalu panjang, ringkas jadi beberapa kata saja.' });
    return;
  }

  const targetWords = panjang === 'panjang' ? '180-220'
    : panjang === 'pendek' ? '60-90'
    : '100-140';

  const model = process.env.GEMINI_MODEL || 'gemini-3.5-flash';

  const prompt =
    'Buatkan SATU teks bacaan berbahasa Indonesia untuk siswa jenjang ' + jenjang +
    ' dengan topik "' + topik + '".\n' +
    'Ketentuan:\n' +
    '- Panjang sekitar ' + targetWords + ' kata, dalam 2-4 paragraf pendek.\n' +
    '- Bahasa dan kosakata harus sesuai usia serta kemampuan baca jenjang ' + jenjang + ', kalimat jelas, tidak bertele-tele.\n' +
    '- Isi harus positif, aman, netral, dan mendidik. Hindari kekerasan, konten dewasa, isu SARA, atau topik sensitif.\n' +
    '- Sertakan judul singkat yang menarik.\n' +
    '- Jangan sertakan penjelasan lain, catatan penulis, atau markdown apa pun selain isi teks bacaan itu sendiri.\n' +
    'Kembalikan HANYA JSON dengan dua field: "title" (judul) dan "content" (isi bacaan, paragraf dipisah baris baru ganda).';

  try {
    const geminiUrl = 'https://generativelanguage.googleapis.com/v1beta/models/' + model + ':generateContent';
    const geminiRes = await fetch(geminiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey
      },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.85,
          responseMimeType: 'application/json',
          responseSchema: {
            type: 'object',
            properties: {
              title: { type: 'string' },
              content: { type: 'string' }
            },
            required: ['title', 'content']
          }
        }
      })
    });

    const data = await geminiRes.json();

    if (!geminiRes.ok) {
      const message = (data && data.error && data.error.message) || 'Gagal menghubungi Gemini API.';
      res.status(geminiRes.status >= 400 && geminiRes.status < 600 ? geminiRes.status : 502).json({ error: message });
      return;
    }

    const candidate = data && data.candidates && data.candidates[0];
    const textPart = candidate && candidate.content && candidate.content.parts && candidate.content.parts[0] && candidate.content.parts[0].text;

    if (!textPart) {
      const finishReason = candidate && candidate.finishReason;
      res.status(502).json({ error: 'Respons AI kosong' + (finishReason ? ' (alasan: ' + finishReason + ')' : '') + '. Coba topik lain.' });
      return;
    }

    let parsed;
    try { parsed = JSON.parse(textPart); }
    catch (e) { res.status(502).json({ error: 'Gagal membaca format hasil AI. Coba lagi.' }); return; }

    if (!parsed.title || !parsed.content) {
      res.status(502).json({ error: 'Hasil AI tidak lengkap. Coba lagi.' });
      return;
    }

    res.status(200).json({ title: String(parsed.title).trim(), content: String(parsed.content).trim() });
  } catch (e) {
    res.status(500).json({ error: 'Terjadi kesalahan server: ' + e.message });
  }
};
