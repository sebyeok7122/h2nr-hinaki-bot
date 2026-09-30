const {
  handleRecruitSetupInteraction
} = require('./recruitSetupHandler');

const {
  handleRecruitButtonInteraction
} = require('./recruitButtonHandler');

const {
  handleShopInteraction
} = require('../commands/shop');

const {
  handleMyWatchersInteraction
} = require('../commands/myWatchers');

const {
  handleMyPartyInteraction
} = require('../commands/myParty');


async function handleInteraction(
  client,
  interaction
) {
  try {
    /*
     * 슬래시 명령어
     */
    if (
      interaction.isChatInputCommand()
    ) {
      const command =
        client.commands.get(
          interaction.commandName
        );

      if (!command) {
        console.warn(
          `⚠️ 등록되지 않은 명령어 호출: ${interaction.commandName}`
        );

        return;
      }


      await command.execute(
        interaction,
        client
      );

      return;
    }


    /*
     * 구인 생성 과정
     */
    const recruitSetupHandled =
      await handleRecruitSetupInteraction(
        interaction
      );


    if (
      recruitSetupHandled
    ) {
      return;
    }


    /*
     * 구인 참여 / 취소 / 자리알림 버튼
     */
    const recruitButtonHandled =
      await handleRecruitButtonInteraction(
        client,
        interaction
      );


    if (
      recruitButtonHandled
    ) {
      return;
    }


    /*
     * /내자리알림
     * 자리알림 취소 선택 메뉴
     */
    const myWatchersHandled =
      await handleMyWatchersInteraction(
        client,
        interaction
      );


    if (
      myWatchersHandled
    ) {
      return;
    }


    /*
     * /내파티찾기
     *
     * 파티 선택
     * 파티글 이동
     * 정상 파티 종료
     */
    const myPartyHandled =
      await handleMyPartyInteraction(
        client,
        interaction
      );


    if (
      myPartyHandled
    ) {
      return;
    }


    /*
     * 희낙샵
     * 상품 선택 / 구매 / 닫기
     */
    const shopHandled =
      await handleShopInteraction(
        interaction
      );


    if (
      shopHandled
    ) {
      return;
    }

  } catch (error) {
    console.error(
      '❌ interaction 처리 중 오류:',
      error
    );


    const errorMessage = {
      content:
        '❌ 처리 중 오류가 발생했습니다.',

      ephemeral:
        true,
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