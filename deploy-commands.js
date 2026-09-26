const fs = require('node:fs');
const path = require('node:path');

const {
  REST,
  Routes
} = require('discord.js');

const {
  DISCORD_IDS
} = require('./src/config/constants');

const token = process.env.DISCORD_BOT_TOKEN?.trim();

if (!token) {
  throw new Error(
    'DISCORD_BOT_TOKEN 환경변수가 설정되어 있지 않습니다.'
  );
}

function getCommandFiles(directory) {
  const files = [];

  if (!fs.existsSync(directory)) {
    return files;
  }

  const entries = fs.readdirSync(directory, {
    withFileTypes: true,
  });

  for (const entry of entries) {
    const fullPath = path.join(
      directory,
      entry.name
    );

    if (entry.isDirectory()) {
      files.push(
        ...getCommandFiles(fullPath)
      );

      continue;
    }

    if (
      entry.isFile() &&
      entry.name.endsWith('.js')
    ) {
      files.push(fullPath);
    }
  }

  return files;
}

const commandsPath = path.join(
  __dirname,
  'src',
  'commands'
);

const commandFiles =
  getCommandFiles(commandsPath);

const commands = [];

for (const filePath of commandFiles) {
  const command = require(filePath);

  if (!command.data) {
    console.warn(
      `⚠️ 등록 데이터가 없는 명령어: ${filePath}`
    );

    continue;
  }

  commands.push(
    command.data.toJSON()
  );
}

const rest = new REST({
  version: '10',
}).setToken(token);

async function deployCommands() {
  try {
    console.log(
      `💛 희낙이 명령어 ${commands.length}개 등록 시작`
    );

    await rest.put(
      Routes.applicationGuildCommands(
        DISCORD_IDS.APPLICATION_ID,
        DISCORD_IDS.GUILD_ID
      ),
      {
        body: commands,
      }
    );

    console.log(
      `✅ 희낙이 명령어 ${commands.length}개 등록 완료`
    );

  } catch (error) {
    console.error(
      '❌ 명령어 등록 실패:',
      error
    );

    process.exitCode = 1;
  }
}

deployCommands();