const { 
    makeWASocket, 
    useMultiFileAuthState, 
    DisconnectReason, 
    fetchLatestBaileysVersion, 
    downloadContentFromMessage 
} = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');
const pino = require('pino');
const fetch = require('node-fetch');
const { Sticker } = require('wa-sticker-formatter');
const readline = require('readline');

// Konfigurasi input di terminal untuk Pairing Code
const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const question = (text) => new Promise((resolve) => rl.question(text, resolve));

// Fungsi pembantu untuk mendownload media/sticker
async function downloadMedia(message, messageType) {
    const stream = await downloadContentFromMessage(message, messageType);
    let buffer = Buffer.from([]);
    for await (const chunk of stream) {
        buffer = Buffer.concat([buffer, chunk]);
    }
    return buffer;
}

// Fungsi pembuat stiker menggunakan wa-sticker-formatter
async function createSticker(img, url, packName, authorName, quality) {
    let stickerMetadata = {
        type: 'crop',
        pack: packName,
        author: authorName,
        quality
    };
    return (new Sticker(img ? img : url, stickerMetadata)).toBuffer();
}

async function startBot() {
    const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
        version,
        auth: state,
        logger: pino({ level: 'silent' }),
        printQRInTerminal: false // Dimatikan karena menggunakan Pairing Code
    });

    // Prosedur Log In Menggunakan Pairing Code
    if (!sock.authState.creds.registered) {
        console.clear();
        console.log("=================================================");
        console.log("   BOT WHATSAPP PAIRING CODE BY ZALLCATALYST   ");
        console.log("=================================================");
        
        // MASUKKAN NOMOR HP DI SINI (Contoh: 628xxxxx) saat diminta di Termux
        const phoneNumber = await question('[?] Masukkan Nomor WhatsApp Bot (Contoh: 628123456789): ');
        const code = await sock.requestPairingCode(phoneNumber.trim());
        
        console.log(`\n[+] KODE PAIRING ANDA:  ${code}  [+]`);
        console.log("[i] Masukkan kode di atas pada Menu: WA -> Perangkat Tertaut -> Tautkan dengan kode telepon.\n");
    }

    // Mengatasi koneksi
    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect } = update;
        if (connection === 'close') {
            const shouldReconnect = (lastDisconnect.error instanceof Boom)?.output?.statusCode !== DisconnectReason.loggedOut;
            console.log('[-] Koneksi terputus. Menghubungkan ulang...', shouldReconnect);
            if (shouldReconnect) startBot();
        } else if (connection === 'open') {
            console.log('[+] Bot WhatsApp Berhasil Terhubung dan Siap Digunakan!');
        }
    });

    sock.ev.on('creds.update', saveCreds);

    // Membaca Pesan Masuk & Menjalankan Fitur (Brat, BratHD, Sticker)
    sock.ev.on('messages.upsert', async ({ messages }) => {
        const m = messages[0];
        if (!m.message || m.key.fromMe) return;

        const from = m.key.remoteJid;
        const type = Object.keys(m.message)[0];
        
        // Struktur pembacaan teks/caption
        const body = (type === 'conversation') ? m.message.conversation : 
                     (type === 'extendedTextMessage') ? m.message.extendedTextMessage.text : 
                     (type === 'imageMessage') ? m.message.imageMessage.caption : 
                     (type === 'videoMessage') ? m.message.videoMessage.caption : '';

        // Parsing Command
        const prefix = /^[./!#]/gi.test(body) ? body.match(/^[./!#]/gi)[0] : '#';
        const isCmd = body.startsWith(prefix);
        const command = isCmd ? body.slice(prefix.length).trim().split(/ +/).shift().toLowerCase() : '';
        const args = body.trim().split(/ +/).slice(1);
        const text = args.join(' ');

        // Info Quotes/Reply
        const quoted = type === 'extendedTextMessage' && m.message.extendedTextMessage.contextInfo ? m.message.extendedTextMessage.contextInfo : null;
        const quotedText = quoted && quoted.quotedMessage ? (quoted.quotedMessage.conversation || quoted.quotedMessage.extendedTextMessage?.text) : null;

        // Fungsi react instan
        const react = async (emoji) => {
            await sock.sendMessage(from, { react: { text: emoji, key: m.key } });
        };

        // ============================================
        // FITUR UTAMA
        // ============================================

        switch (command) {
            case 'brat': {
                let txt = quotedText ? quotedText : text;
                if (!txt) return sock.sendMessage(from, { text: 'Reply atau masukkan teks! Contoh: .brat halo' }, { quoted: m });

                try {
                    await react('🕒');
                    const responseUrl = `https://aqul-brat.hf.space?text=${encodeURIComponent(txt)}`;
                    let stiker = await createSticker(false, responseUrl, 'Sticker Pack', 'Bot', 10);
                    
                    if (stiker) {
                        await sock.sendMessage(from, { sticker: stiker }, { quoted: m });
                        await react('✅');
                    } else {
                        await react('❌');
                    }
                } catch (e) {
                    await react('❌');
                    console.error(e);
                }
                break;
            }

            case 'brathd': {
                let txt = quotedText ? quotedText : text;
                if (!txt) return sock.sendMessage(from, { text: 'Reply atau masukkan teks! Contoh: .brathd halo' }, { quoted: m });

                try {
                    await react('🕒');
                    const responseUrl = `https://api-faa.my.id/faa/brathd?text=${encodeURIComponent(txt)}`;
                    let stiker = await createSticker(false, responseUrl, "Sticker", "ᴋᴜʀᴜᴍɪ ᴍᴅ ʙy ʜɪʟᴍᴀɴ", 10);
                    
                    if (stiker) {
                        await sock.sendMessage(from, { sticker: stiker }, { quoted: m });
                        await react('✅');
                    } else {
                        await react('❌');
                    }
                } catch (e) {
                    await react('❌');
                    console.error(e);
                }
                break;
            }

            case 's':
            case 'stiker':
            case 'sticker': {
                // Mendeteksi apakah media ada di pesan utama atau di-reply
                let isMedia = /image|video|webp/.test(type);
                let isQuotedMedia = quoted && quoted.quotedMessage && /imageMessage|videoMessage|webpMessage/.test(Object.keys(quoted.quotedMessage)[0]);

                if (isMedia || isQuotedMedia) {
                    try {
                        await react('🕒');
                        let targetMessage = isMedia ? m.message : quoted.quotedMessage;
                        let targetType = isMedia ? type : Object.keys(quoted.quotedMessage)[0];

                        // Ambil detail pesan internal
                        let mediaMessage = targetMessage[targetType];

                        // Cek durasi jika video
                        if (targetType === 'videoMessage' && (mediaMessage.seconds > 10)) {
                            return sock.sendMessage(from, { text: 'Video harus berdurasi di bawah 10 detik.' }, { quoted: m });
                        }

                        // Download media ke Buffer
                        let mediaBuffer = await downloadMedia(mediaMessage, targetType.replace('Message', ''));
                        
                        // Metadata packname & author kustom (Contoh: .s Pack, Author)
                        let packname = "Sticker Pack";
                        let author = "Bot WhatsApp";
                        if (text) {
                            const [p, a] = text.split(/[,|\-+&]/);
                            if (p) packname = p.trim();
                            if (a) author = a.trim();
                        }

                        let stiker = await createSticker(mediaBuffer, false, packname, author, 50);
                        await sock.sendMessage(from, { sticker: stiker }, { quoted: m });
                        await react('✅');
                    } catch (e) {
                        await react('❌');
                        console.error(e);
                    }
                } else {
                    sock.sendMessage(from, { text: 'Kirim atau reply media (foto/video/gif) untuk dijadikan stiker.' }, { quoted: m });
                }
                break;
            }
        }
    });
}

startBot();
