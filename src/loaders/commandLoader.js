const fs = require('node:fs');
const path = require('node:path');

function getCommandFiles(directory) {
  const files = [];

  if (!fs.existsSync(directory)) {
    return files;
  }

  const entries = fs.readdirSync(directory, {
    withFileTypes: true,
  });

  for (const entry of entries) {
    const fullPath = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      files.push(...getCommandFiles(fullPath));
      continue;
    }

    if (entry.isFile() && entry.name.endsWith('.js')) {
      files.push(fullPath);
    }
  }

  return files;
}

function loadCommands(client) {
  const commandsPath = path.join(
    __dirname,
    '..',
    'commands'
  );

  const commandFiles = getCommandFiles(commandsPath);

  for (const filePath of commandFiles) {
    const command = require(filePath);

    if (
      !command.data ||
      typeof command.execute !== 'function'
    ) {
      console.warn(
        `⚠️ 명령어 형식이 올바르지 않습니다: ${filePath}`
      );
      continue;
    }

    client.commands.set(
      command.data.name,
      command
    );
  }

  console.log(
    `💛 희낙이 명령어 ${client.commands.size}개 로드 완료`
  );
}

module.exports = {
  loadCommands,
};