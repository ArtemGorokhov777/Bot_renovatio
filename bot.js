require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const fs = require('fs');
const path = require('path');

const token = process.env.TELEGRAM_BOT_TOKEN;
const bot = new TelegramBot(token, { polling: true });

const knowledgeBaseFilePath = path.join(__dirname, 'knowledge_base.json');
const statisticsFilePath = path.join(__dirname, 'statistics.json');

let knowledgeBase;
try {
  if (fs.existsSync(knowledgeBaseFilePath)) {
    const fileContent = fs.readFileSync(knowledgeBaseFilePath);
    knowledgeBase = JSON.parse(fileContent);
    if (!knowledgeBase.sections || !Array.isArray(knowledgeBase.sections)) {
      throw new Error('Некорректная структура файла knowledge_base.json');
    }
  } else {
    throw new Error('Файл knowledge_base.json не найден');
  }
} catch (error) {
  console.error('Ошибка при загрузке базы знаний:', error.message);
  knowledgeBase = { sections: [] };
}

let statistics;
try {
  if (fs.existsSync(statisticsFilePath)) {
    const statsContent = fs.readFileSync(statisticsFilePath);
    statistics = JSON.parse(statsContent);
    if (typeof statistics.start_command_count !== 'number' || typeof statistics.article_views !== 'object') {
      throw new Error('Некорректная структура файла statistics.json');
    }
  } else {
    statistics = { start_command_count: 0, article_views: {} };
  }
} catch (error) {
  console.error('Ошибка при загрузке статистики:', error.message);
  statistics = { start_command_count: 0, article_views: {} };
}

function saveStatistics() {
  fs.writeFileSync(statisticsFilePath, JSON.stringify(statistics, null, 2));
}

const userStates = {};

bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  userStates[chatId] = { level: 'main', data: null, messageId: null };

  statistics.start_command_count += 1;
  saveStatistics();

  const welcomeMessage = `
  🖐 Привет! Я ваш бот для работы с базой знаний.
  `;

  bot.sendMessage(chatId, welcomeMessage, { parse_mode: 'Markdown' });
  sendMainMenu(chatId);
});


function sendMainMenu(chatId) {
  const sections = knowledgeBase.sections;

  if (sections.length === 0) {
    bot.sendMessage(chatId, 'В базе знаний пока нет разделов.');
    return;
  }

  const sectionButtons = sections.map((section, sectionIndex) => [
    { text: section.name, callback_data: `section_${sectionIndex}` }
  ]);

  const options = {
    reply_markup: {
      inline_keyboard: sectionButtons
    }
  };

  sendOrEditMessage(chatId, '📎Выберите необходимый раздел:', options);
}

function sendTopicsMenu(chatId, sectionIndex) {
  const section = knowledgeBase.sections[sectionIndex];

  if (!section || !section.topics || section.topics.length === 0) {
    sendOrEditMessage(chatId, 'В выбранном разделе нет доступных тем.');
    return;
  }

  const topicButtons = section.topics.map((topic, topicIndex) => [
    { text: topic.title, callback_data: `topic_${sectionIndex}_${topicIndex}` }
  ]);

  const backButton = [{ text: '🔙 Назад', callback_data: 'back_main' }];

  const options = {
    reply_markup: {
      inline_keyboard: [...topicButtons, backButton]
    }
  };

  sendOrEditMessage(chatId, `Выберите тему из раздела "${section.name}":`, options);
}

function sendSubtopicsMenu(chatId, sectionIndex, topicIndex) {
  const topic = knowledgeBase.sections[sectionIndex].topics[topicIndex];

  if (!topic || !topic.subtopics || topic.subtopics.length === 0) {
    sendOrEditMessage(chatId, 'В выбранной теме нет доступных подтем.');
    return;
  }

  const subtopicButtons = topic.subtopics.map((subtopic, subtopicIndex) => [
    { text: subtopic.title, callback_data: `subtopic_${sectionIndex}_${topicIndex}_${subtopicIndex}` }
  ]);

  const backButton = [{ text: '🔙 Назад', callback_data: `back_topic_${sectionIndex}` }];

  const options = {
    reply_markup: {
      inline_keyboard: [...subtopicButtons, backButton]
    }
  };

  sendOrEditMessage(chatId, `📌 Выберите подтему из темы "${topic.title}":`, options);
}

function saveKnowledgeBase() {
  fs.writeFileSync(knowledgeBaseFilePath, JSON.stringify(knowledgeBase, null, 2));
}
bot.on('callback_query', (callbackQuery) => {
  const chatId = callbackQuery.message.chat.id;
  const data = callbackQuery.data;

  if (data === 'back_main') {
    sendMainMenu(chatId);
    return;
  }

  if (data.startsWith('back_section_')) {
    const sectionIndex = parseInt(data.split('_')[2], 10);
    sendTopicsMenu(chatId, sectionIndex);
    return;
  }

  if (data.startsWith('back_topic_')) {
    const sectionIndex = parseInt(data.split('_')[2], 10);
    sendTopicsMenu(chatId, sectionIndex);
    return;
  }

  if (data.startsWith('section_')) {
    const sectionIndex = parseInt(data.split('_')[1], 10);
    sendTopicsMenu(chatId, sectionIndex);
    return;
  }

  if (data.startsWith('topic_')) {
    const [_, sectionIndex, topicIndex] = data.split('_').map(Number);
    sendSubtopicsMenu(chatId, sectionIndex, topicIndex);
    return;
  }

  if (data.startsWith('subtopic_')) {
    const [_, sectionIndex, topicIndex, subtopicIndex] = data.split('_').map(Number);
    sendArticleLink(chatId, sectionIndex, topicIndex, subtopicIndex);
    return;
  }

  bot.answerCallbackQuery(callbackQuery.id, { text: 'Неизвестный запрос', show_alert: true });
});

function sendArticleLink(chatId, sectionIndex, topicIndex, subtopicIndex) {
  const section = knowledgeBase.sections[sectionIndex];
  const topic = section.topics[topicIndex];
  const subtopic = topic.subtopics[subtopicIndex];

  if (!subtopic || !subtopic.link) {
    sendOrEditMessage(chatId, 'Статья не найдена.');
    return;
  }

  const articleLinkButton = [
    [{ text: `Ссылка на статью: ${subtopic.title}`, url: subtopic.link }]
  ];

  const backButton = [{ text: '🔙 Назад', callback_data: `back_topic_${sectionIndex}` }];

  const options = {
    reply_markup: {
      inline_keyboard: [...articleLinkButton, backButton]
    }
  };

  sendOrEditMessage(chatId, '😎 Вот ссылка на статью:', options);
}

function sendOrEditMessage(chatId, text, options = {}) {
  if (userStates[chatId]?.messageId) {
    bot.editMessageText(text, {
      chat_id: chatId,
      message_id: userStates[chatId].messageId,
      reply_markup: options.reply_markup
    }).catch((error) => {
      console.error('Ошибка при редактировании сообщения:', error.message);
    });
  } else {
    bot.sendMessage(chatId, text, options).then((message) => {
      userStates[chatId].messageId = message.message_id;
    }).catch((error) => {
      console.error('Ошибка при отправке сообщения:', error.message);
    });
  }
}

console.log('Bot is running...');
