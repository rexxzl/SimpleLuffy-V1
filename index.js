const { default: makeWASocket, useMultiFileAuthState } = require("@whiskeysockets/baileys")
const pino = require("pino")
const fs = require("fs")
const path = require("path")

const WELCOME_FILE = "./lib/welcome.json"
const virtexLimit = 7000

if (!fs.existsSync(WELCOME_FILE)) fs.writeFileSync(WELCOME_FILE, "{}")
const welcome = JSON.parse(fs.readFileSync(WELCOME_FILE))

const startBot = async () => {
    const { state, saveCreds } = await useMultiFileAuthState("session")
    const sock = makeWASocket({
        logger: pino({ level: "silent" }),
        printQRInTerminal: true,
        auth: state
    })

    sock.ev.on("creds.update", saveCreds)

    // Welcome & Goodbye Handler
    sock.ev.on("group-participants.update", async (anu) => {
        const metadata = await sock.groupMetadata(anu.id)
        const num = anu.participants[0]
        if (welcome[anu.id]) {
            if (anu.action === "add") {
                sock.sendMessage(anu.id, { text: `Selamat datang @${num.split("@")[0]} di ${metadata.subject}`, mentions: [num] })
            } else if (anu.action === "remove") {
                sock.sendMessage(anu.id, { text: `Sampai jumpa @${num.split("@")[0]}`, mentions: [num] })
            }
        }
    })

    // Message Handler
    sock.ev.on("messages.upsert", async ({ messages }) => {
        const msg = messages[0]
        if (!msg.message) return
        const from = msg.key.remoteJid
        const type = Object.keys(msg.message)[0]
        const body = msg.message.conversation || msg.message[type]?.text || ""
        const sender = msg.key.participant || msg.key.remoteJid
        const isGroup = from.endsWith("@g.us")

        // Anti Virtex
        if (body.length > virtexLimit) {
            await sock.sendMessage(from, { text: "Pesan terlalu panjang, dianggap virtex dan dihapus otomatis." })
            return sock.sendMessage(from, { delete: msg.key })
        }

        // Anti Fake Number
        if (!sender.startsWith("62")) {
            await sock.sendMessage(from, { text: "Nomor non-Indonesia tidak diperbolehkan!" })
            return
        }

        // Anti Delete
        sock.ev.on("messages.update", (updates) => {
            for (let info of updates) {
                if (info.update.messageStubType === 1) {
                    sock.sendMessage(from, {
                        text: `Pesan dihapus oleh @${sender.split("@")[0]}`,
                        mentions: [sender]
                    })
                }
            }
        })

        // Perintah
        if (body.startsWith(".stiker")) {
            const teks = body.replace(".stiker", "").trim()
            if (!teks) return sock.sendMessage(from, { text: "Masukkan teksnya!" })
            sock.sendMessage(from, {
                sticker: {
                    url: `https://api.dhamzxploit.my.id/api/maker/attp?text=${encodeURIComponent(teks)}`
                }
            })
        }

        // Aktifkan Welcome untuk Grup Ini
        if (body === ".setwelcome" && isGroup) {
            welcome[from] = true
            fs.writeFileSync(WELCOME_FILE, JSON.stringify(welcome, null, 2))
            sock.sendMessage(from, { text: "Fitur welcome & goodbye diaktifkan untuk grup ini." })
        }

        // Nonaktifkan Welcome untuk Grup Ini
        if (body === ".delwelcome" && isGroup) {
            delete welcome[from]
            fs.writeFileSync(WELCOME_FILE, JSON.stringify(welcome, null, 2))
            sock.sendMessage(from, { text: "Fitur welcome & goodbye dimatikan untuk grup ini." })
        }
    })
}

startBot()
