const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require("@whiskeysockets/baileys")
const pino = require("pino")
const fs = require("fs")
const { Boom } = require("@hapi/boom")
const { exec } = require("child_process")

const welcome = JSON.parse(fs.readFileSync("./lib/welcome.json"))
const fakeNumRegex = /[^0-9]/g
const virtexLimit = 7000

const startBot = async () => {
    const { state, saveCreds } = await useMultiFileAuthState("session")
    const sock = makeWASocket({
        logger: pino({ level: "silent" }),
        printQRInTerminal: true,
        auth: state
    })

    sock.ev.on("creds.update", saveCreds)

    sock.ev.on("messages.upsert", async ({ messages }) => {
        const msg = messages[0]
        if (!msg.message) return
        const from = msg.key.remoteJid
        const type = Object.keys(msg.message)[0]
        const body = msg.message.conversation || msg.message[type]?.text || ""
        const sender = msg.key.participant || msg.key.remoteJid
        const isGroup = from.endsWith("@g.us")
        const isAdmin = sender.includes("85750296797")
        
        // Anti virtex
        if (body.length > virtexLimit) {
            await sock.sendMessage(from, { text: "Pesan terlalu panjang, dianggap virtex dan dihapus otomatis." })
            return sock.sendMessage(from, { delete: msg.key })
        }

        // Anti fake number
        if (!sender.startsWith("62")) {
            await sock.sendMessage(from, { text: "Nomor non-Indonesia tidak diperbolehkan!" })
            return
        }

        // Anti delete
        sock.ev.on("messages.update", (update) => {
            for (let info of update) {
                if (info.update.messageStubType === 1) {
                    sock.sendMessage(from, { text: `Pesan dihapus oleh @${sender.split("@")[0]}`, mentions: [sender] })
                }
            }
        })

        // Welcome & Goodbye
        sock.ev.on("group-participants.update", async (anu) => {
            const metadata = await sock.groupMetadata(anu.id)
            const num = anu.participants[0]
            if (anu.action === "add") {
                if (welcome[anu.id]) {
                    sock.sendMessage(anu.id, { text: `Selamat datang @${num.split("@")[0]} di ${metadata.subject}`, mentions: [num] })
                }
            } else if (anu.action === "remove") {
                if (welcome[anu.id]) {
                    sock.sendMessage(anu.id, { text: `Sampai jumpa @${num.split("@")[0]}`, mentions: [num] })
                }
            }
        })

        // Command: .stiker
        if (body.startsWith(".stiker")) {
            const teks = body.replace(".stiker", "").trim()
            if (!teks) return sock.sendMessage(from, { text: "Masukkan teksnya!" })
            sock.sendMessage(from, { sticker: { url: `https://api.dhamzxploit.my.id/api/maker/attp?text=${encodeURIComponent(teks)}` } })
        }
    })
}

startBot()
