const { createBot } = require('../../bot');

const bot = createBot();

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      body: 'Method Not Allowed'
    };
  }

  try {
    const update = JSON.parse(event.body || '{}');
    await bot.handleUpdate(update);

    return {
      statusCode: 200,
      body: 'OK'
    };
  } catch (error) {
    console.error('Webhook handling error:', error);

    return {
      statusCode: 500,
      body: 'Internal Server Error'
    };
  }
};
