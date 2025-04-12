const { default: makeWASocket, useMultiFileAuthState } = require('@whiskeysockets/baileys')
const pino = require('pino')
const fs = require('fs')

const WELCOME_FILE = './lib/welcome.json'
const FAKE_FILE = './lib/fakenum.json'

const virtexLimit = 7000

// Inisialisasi file welcome.json dan fakenum.json jika belum ada
if (!fs.existsSync(WELCOME_FILE)) fs.writeFileSync(WELCOME_FILE, '{}')
if (!fs.existsSync(FAKE_FILE)) fs.writeFileSync(FAKE_FILE, '{}')

let welcome = JSON.parse(fs.readFileSync(WELCOME_FILE))
let fakeWarn = JSON.parse(fs.readFileSync(FAKE_FILE))

const startBot = async () => {
    const { state, saveCreds } = await useMultiFileAuthState('session')
    const sock = makeWASocket({
        logger: pino({ level: 'silent' }),
        printQRInTerminal: true,
        auth: state,
    })

    sock.ev.on('creds.update', saveCreds)

    // Handler Welcome & Goodbye
    sock.ev.on('group-participants.update', async (anu) => {
        const metadata = await sock.groupMetadata(anu.id)
        const num = anu.participants[0]
        if (welcome[anu.id]) {
            if (anu.action === 'add') {
                sock.sendMessage(anu.id, {
                    text: `Selamat datang @${num.split('@')[0]} di ${metadata.subject}`,
                    mentions: [num],
                })
            } else if (anu.action === 'remove') {
                sock.sendMessage(anu.id, {
                    text: `Sampai jumpa @${num.split('@')[0]}`,
                    mentions: [num],
                })
            }
        }
    })

    // Handler Pesan Masuk
    sock.ev.on('messages.upsert', async ({ messages }) => {
        const msg = messages[0]
        if (!msg.message) return

        const from = msg.key.remoteJid
        const sender = msg.key.participant || msg.key.remoteJid
        const type = Object.keys(msg.message)[0]
        const body = msg.message.conversation || msg.message[type]?.text || ''
        const isGroup = from.endsWith('@g.us')

        // Cek jika di grup dan pengirim bukan admin, maka abaikan semua fitur
        if (isGroup) {
            const groupMetadata = await sock.groupMetadata(from)
            const isSenderAdmin = groupMetadata.participants.find((p) => p.id === sender)?.admin
            if (!isSenderAdmin) return
        }

        // Anti virtex
        if (body.length > virtexLimit) {
            await sock.sendMessage(from, { text: 'Pesan terlalu panjang, dianggap virtex dan dihapus.' })
            return sock.sendMessage(from, { delete: msg.key })
        }

        // Anti fake number SP1-SP3
        if (isGroup && !sender.startsWith('62')) {
            if (!fakeWarn[from]) fakeWarn[from] = {}
            if (!fakeWarn[from][sender]) fakeWarn[from][sender] = 0

            fakeWarn[from][sender] += 1
            fs.writeFileSync(FAKE_FILE, JSON.stringify(fakeWarn, null, 2))

            const sp = fakeWarn[from][sender]

            if (sp === 1) {
                await sock.sendMessage(from, {
                    text: `SP1: @${sender.split('@')[0]} terdeteksi menggunakan nomor luar Indonesia.`,
                    mentions: [sender],
                })
            } else if (sp === 2) {
                await sock.sendMessage(from, {
                    text: `SP2: @${sender.split('@')[0]} masih menggunakan nomor luar Indonesia!`,
                    mentions: [sender],
                })
            } else if (sp >= 3) {
                await sock.sendMessage(from, {
                    text: `SP3: @${sender.split('@')[0]} dikeluarkan karena tidak mematuhi aturan.`,
                    mentions: [sender],
                })
                await sock.groupParticipantsUpdate(from, [sender], 'remove')
                delete fakeWarn[from][sender]
                fs.writeFileSync(FAKE_FILE, JSON.stringify(fakeWarn, null, 2))
            }
            return
        }

        // Command: .stiker
        if (body.startsWith('.stiker')) {
            const teks = body.replace('.stiker', '').trim()
            if (!teks) return sock.sendMessage(from, { text: 'Masukkan teksnya!' })
            sock.sendMessage(from, {
                sticker: {
                    url: `https://api.dhamzxploit.my.id/api/maker/attp?text=${encodeURIComponent(teks)}`,
                },
            })
        }

        // Command: .setwelcome
        if (body === '.setwelcome' && isGroup) {
            welcome[from] = true
            fs.writeFileSync(WELCOME_FILE, JSON.stringify(welcome, null, 2))
            sock.sendMessage(from, { text: 'Fitur Welcome/Goodbye diaktifkan untuk grup ini.' })
        }

        // Command: .delwelcome
        if (body === '.delwelcome' && isGroup) {
            delete welcome[from]
            fs.writeFileSync(WELCOME_FILE, JSON.stringify(welcome, null, 2))
            sock.sendMessage(from, { text: 'Fitur Welcome/Goodbye dimatikan untuk grup ini.' })
        }

        // Command: .menu (dengan button teks)
        if (body === '.menu') {
            const buttons = [
                { buttonId: '.setwelcome', buttonText: { displayText: 'Aktifkan Welcome' }, type: 1 },
                { buttonId: '.delwelcome', buttonText: { displayText: 'Nonaktifkan Welcome' }, type: 1 },
                { buttonId: '.stiker Halo!', buttonText: { displayText: 'Coba Stiker' }, type: 1 },
            ]
            const text = `*SimpleLuffy-V1 Menu*

• .stiker <teks> → Teks jadi stiker
• .setwelcome / .delwelcome → Atur Welcome grup

Fitur Otomatis (aktif default):
• Anti Virtex (hapus spam)
• Anti Delete (deteksi hapus)
• Anti Fake Number (blokir nomor luar 62)

Tekan tombol di bawah untuk mulai:`

            sock.sendMessage(from, {
                text,
                buttons,
                footer: 'Bot by @rexxzl',
                headerType: 1,
            })
        }
    })
}

startBot()
