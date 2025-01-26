const { chromium } = require('playwright');
const TelegramBot = require('node-telegram-bot-api');
const fs = require('fs');

const bot = new TelegramBot('7832217088:AAEbMw8wUeA8Q7LCOYW7RC_aKxhJt2M97MA', { polling: true });
const userSessions = {};

// Fungsi untuk membersihkan sesi pengguna
function cleanupSession(chatId) {
  delete userSessions[chatId];
}

// Handler perintah /start
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  userSessions[chatId] = { step: 'location' };
  bot.sendMessage(chatId, '🔍 Silakan masukkan lokasi OLT (Contoh: GPON BIG OLT - MEGA HOUSE SIDOARJO):');
});

// Handler pesan masuk
bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;
  const session = userSessions[chatId];

  if (!session) return;

  try {
    if (session.step === 'location') {
      session.location = text;
      session.step = 'fsp';
      bot.sendMessage(chatId, '🔢 Sekarang masukkan F/S/P (Format: 0/2/9):');
    } 
    else if (session.step === 'fsp' && /^\d+\/\d+\/\d+$/.test(text)) {
      session.fsp = text;
      session.step = 'processing';
      
      // Memulai proses scraping
      bot.sendMessage(chatId, '⏳ Memproses permintaan...');
      
      const browser = await chromium.launch();
      const page = await browser.newPage();

      try {
        // Proses login
        await page.goto('https://cmc-tools.biznetnetworks.com/login');
        await page.fill('input[placeholder="Username"]', 'username');
        await page.fill('input[placeholder="Password"]', 'password');
        await page.click('button.btn.btn-block.btn-primary');
        await page.waitForNavigation();

        // Navigasi ke halaman OLT
        await page.goto('https://cmc-tools.biznetnetworks.com/networks/noc-tools/power-olt/index#/');
        
        // Proses input lokasi
        await page.click('.vs__search'); // Membuka dropdown
        await page.fill('.vs__search', session.location);
        await page.waitForSelector('.vs__dropdown-option');
        await page.click('.vs__dropdown-option');

        // Input F/S/P
        await page.fill('input.form-control.form-control-sm.input-olt_port', session.fsp);
        await page.click('button.btn.btn-sm.btn-bz.col-md-12');

        // Tunggu hasil dan ambil data
        await page.waitForSelector('.row .col-md-12', { state: 'visible' });
        const result = await page.$eval('.row .col-md-12', el => el.innerText);

        // Kirim hasil
        await bot.sendMessage(chatId, `📊 Hasil Pencarian:\n${result}`);
        await page.screenshot({ path: 'result.png' });
        await bot.sendPhoto(chatId, fs.readFileSync('result.png'));
        fs.unlinkSync('result.png');

      } finally {
        await browser.close();
        cleanupSession(chatId);
      }
    }
  } catch (error) {
    console.error('Error:', error);
    bot.sendMessage(chatId, '❌ Terjadi kesalahan saat memproses permintaan');
    cleanupSession(chatId);
  }
});