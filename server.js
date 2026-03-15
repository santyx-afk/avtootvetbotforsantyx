const express = require('express');
const { createBot } = require('./bot');

const bot = createBot();
const app = express();
