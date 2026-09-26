const {
  SlashCommandBuilder
} = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('희낙테스트')
    .setDescription('희낙이 명령어 작동 여부를 확인합니다.'),

  async execute(interaction) {
    await interaction.reply({
      content: '💛 희낙이 정상 작동 중입니다 💛',
      ephemeral: true,
    });
  },
};