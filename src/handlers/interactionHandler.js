async function handleInteraction(client, interaction) {
  try {
    if (!interaction.isChatInputCommand()) {
      return;
    }

    const command = client.commands.get(
      interaction.commandName
    );

    if (!command) {
      console.warn(
        `⚠️ 등록되지 않은 명령어 호출: ${interaction.commandName}`
      );

      return;
    }

    await command.execute(interaction, client);

  } catch (error) {
    console.error(
      '❌ interaction 처리 중 오류:',
      error
    );

    const errorMessage = {
      content: '❌ 명령어 처리 중 오류가 발생했습니다.',
      ephemeral: true,
    };

    try {
      if (
        interaction.replied ||
        interaction.deferred
      ) {
        await interaction.followUp(
          errorMessage
        );
      } else {
        await interaction.reply(
          errorMessage
        );
      }
    } catch (replyError) {
      console.error(
        '❌ 오류 메시지 전송 실패:',
        replyError
      );
    }
  }
}

module.exports = {
  handleInteraction,
};