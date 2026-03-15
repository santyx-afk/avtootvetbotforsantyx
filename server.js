const express = require('express');
const { createBot } = require('./bot');

const PORT = Number(process.env.PORT || 3000);
const bot = createBot();
const app = express();

app.use(express.json());

app.get('/health', (_, res) => {
  res.status(200).send('ok');
});

// Local webhook endpoint (optional)
app.post('/telegram-webhook', async (req, res) => {
  try {
    await bot.handleUpdate(req.body);
    res.status(200).send('OK');
  } catch (error) {
    console.error('Webhook handling error:', error);
    res.status(500).send('Internal Server Error');
  }
});

// Default: polling mode for local/dev usage
bot.launch().then(() => {
  console.log('Bot polling started');
});

app.listen(PORT, () => {
  console.log(`Server started on port ${PORT}`);
});

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
