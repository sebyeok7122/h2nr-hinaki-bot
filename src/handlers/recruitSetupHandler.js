
const {
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  MessageFlags
} = require('discord.js');

const {
  getSetupSession,
  updateSetupSession,
  deleteSetupSession
} = require('../services/recruitSetupService');

const {
  createRecruitment,
  getRecruitmentSnapshot,
  setRecruitmentMessageId,
  deleteRecruitment
} = require('../services/recruitService');

const {
  buildRecruitmentMessage
} = require('../ui/recruitMessageBuilder');


const COMPLETE_TITLES = {
  GENERAL: '일반게임 구인',
  RANKED: '경쟁전 구인',
  GENERAL_HARD: '일반 빡겜 구인',
  RANKED_HARD: '경쟁 빡겜 구인',
  NEWBIE: '신입 파티',
  DUO: '듀오 구인',
  OTHER_GAME: '종겜 구인',
  MERCENARY: '용병 구인'
};


const ROOM_SETTINGS = {
  SQUAD: { label: '스쿼드', max: 13 },
  DUO: { label: '듀오', max: 4 },
  OTHER_GAME: { label: '종겜', max: 8 },
  MERCENARY: { label: '용병', max: 3 }
};


/*
 * 파티 설명 입력 모달
 */
function buildDescriptionModal() {
  const input = new TextInputBuilder()
    .setCustomId('recruit_description')
    .setLabel('파티 분위기나 원하는 플레이')
    .setStyle(TextInputStyle.Paragraph)
    .setPlaceholder('예: 즐겜 / 마이크 필수 / 한 자리 구해요!')
    .setRequired(true)
    .setMinLength(1)
    .setMaxLength(100);

  return new ModalBuilder()
    .setCustomId('recruit_setup_description')
    .setTitle('📝 파티 설명 작성')
    .addComponents(
      new ActionRowBuilder().addComponents(input)
    );
}


/*
 * 기존 DB의 start_time 필드 호환용
 *
 * 사용자에게 시간 선택을 요구하지 않고,
 * 구인 생성 당시 한국 시간을 저장합니다.
 *
 * 자동 종료는 이 값이 아닌
 * DB의 created_at 기준으로 계산합니다.
 */
function getCurrentKstTime() {
  return new Date(
    Date.now() + 9 * 60 * 60 * 1000
  )
    .toISOString()
    .slice(11, 16);
}


/*
 * 최종 구인 생성
 */
async function createRecruitmentFromSession(
  interaction,
  session,
  description
) {
  const room =
    ROOM_SETTINGS[session.voiceKind] ||
    ROOM_SETTINGS.SQUAD;

  let recruitment = null;
  let recruitMessage = null;

  try {
    /*
     * 구인 DB 생성
     */
    recruitment = createRecruitment({
      guildId: interaction.guildId,
      channelId:
        session.channelId || interaction.channelId,

      type: session.type,
      creatorId: interaction.user.id,
      voiceKind: session.voiceKind,
      voiceRoomNumber: session.roomNumber,
      gameName: session.gameName || null,
      description,

      newbieMemberIds:
        session.newbieMemberIds || [],

      capacity: session.capacity,
      startTime: getCurrentKstTime(),
      memberIds: session.memberIds
    });

    const snapshot =
      getRecruitmentSnapshot(recruitment.id);

    if (!snapshot) {
      throw new Error(
        '생성된 구인 정보를 DB에서 찾을 수 없습니다.'
      );
    }

    /*
     * 실제 구인글 전송
     */
    const channel =
      interaction.channel ||
      await interaction.client.channels.fetch(
        session.channelId
      );

    if (
      !channel ||
      typeof channel.send !== 'function'
    ) {
      throw new Error(
        '구인 채널에 메시지를 보낼 수 없습니다.'
      );
    }

    recruitMessage = await channel.send(
      buildRecruitmentMessage(
        snapshot,
        { pingHere: true }
      )
    );

    /*
     * 원본 메시지 ID 저장
     */
    setRecruitmentMessageId(
      recruitment.id,
      recruitMessage.id
    );

  } catch (error) {
    /*
     * 게시물이 이미 올라갔다면
     * 무조건 DB만 삭제하지 않습니다.
     *
     * 게시물 정리에 성공했을 때만
     * DB를 함께 정리합니다.
     */
    let safeToRollback = !recruitMessage;

    if (recruitMessage) {
      try {
        await recruitMessage.delete();
        safeToRollback = true;

      } catch (removeError) {
        console.error(
          `❌ 구인 ${recruitment?.id} 게시물 정리 실패 (운영진 확인 필요):`,
          removeError
        );
      }
    }

    if (recruitment?.id && safeToRollback) {
      try {
        deleteRecruitment(recruitment.id);

      } catch (rollbackError) {
        console.error(
          '❌ 구인 DB 정리 실패:',
          rollbackError
        );
      }
    }

    throw error;
  }


  /*
   * 여기부터는 생성 완료 상태!
   * 안내 메시지에서 오류가 나더라도
   * 구인 DB와 게시물을 삭제하지 않습니다.
   */
  deleteSetupSession(
    interaction.guildId,
    interaction.user.id
  );


  /*
   * 기존 개인 설정 화면 버튼 제거
   */
  if (session.sourceInteraction) {
    try {
      await session.sourceInteraction.editReply({
        content:
          '✅ 구인 설정이 완료되었습니다! 아래 생성 완료 안내를 확인해주세요.',

        components: []
      });

    } catch (error) {
      console.warn(
        '⚠️ 구인 설정 안내 갱신 실패:',
        error.message
      );
    }
  }


  const title =
    COMPLETE_TITLES[session.type] ||
    '파티 구인';


  /*
   * 모달 응답은 이미 deferReply 처리됨.
   * 반드시 editReply 사용!
   */
  await interaction.editReply({
    content:
      `✅ **${title} 생성 완료!**\n\n` +
      `👥 현재 인원: ${session.memberIds.length} / ${session.capacity}명\n` +
      `🔊 ${room.label} ${session.roomNumber}번방\n` +
      `📝 ${description}\n` +
      '⏰ 등록 후 3시간 뒤 자동 종료\n\n' +
      `[👉 구인글 바로가기](${recruitMessage.url})`
  });
}


/*
 * 구인 생성 과정 인터랙션 처리
 */
async function handleRecruitSetupInteraction(
  interaction
) {
  /*
   * 이전 버전의 선택 메뉴를 누른 경우
   */
  const oldIds = [
    'recruit_setup_members',
    'recruit_setup_hour',
    'recruit_setup_minute'
  ];

  if (
    oldIds.includes(interaction.customId) &&
    (
      interaction.isUserSelectMenu() ||
      interaction.isStringSelectMenu()
    )
  ) {
    await interaction.reply({
      content:
        '🔄 구인 방식이 새롭게 바뀌었어요! 다시 구인 명령어를 실행해주세요.',

      flags: MessageFlags.Ephemeral
    });

    return true;
  }


  /*
   * 1. 음성방 선택
   *
   * 멘션 입력이 완료되면
   * recruitMentionHandler에서 이 메뉴를 띄웁니다.
   */
  if (
    interaction.isStringSelectMenu() &&
    interaction.customId === 'recruit_setup_room'
  ) {
    const session = getSetupSession(
      interaction.guildId,
      interaction.user.id
    );

    if (!session) {
      await interaction.reply({
        content:
          '⏰ 구인 설정 시간이 만료됐어요. 다시 명령어를 실행해주세요.',

        flags: MessageFlags.Ephemeral
      });

      return true;
    }

    if (
      session.step !== 'AWAITING_ROOM' ||
      !session.memberIds?.length ||
      (
        session.channelId &&
        session.channelId !== interaction.channelId
      )
    ) {
      await interaction.reply({
        content:
          '❎ 멤버 입력부터 다시 진행해주세요.',

        flags: MessageFlags.Ephemeral
      });

      return true;
    }

    const room =
      ROOM_SETTINGS[session.voiceKind] ||
      ROOM_SETTINGS.SQUAD;

    const roomNumber =
      Number(interaction.values[0]);

    if (
      !Number.isInteger(roomNumber) ||
      roomNumber < 1 ||
      roomNumber > room.max
    ) {
      await interaction.reply({
        content:
          '❎ 올바른 방 번호를 선택해주세요.',

        flags: MessageFlags.Ephemeral
      });

      return true;
    }

    /*
     * 방 선택 직후
     * 설명 작성 모달을 바로 띄웁니다.
     */
    await interaction.showModal(
      buildDescriptionModal()
    );

    updateSetupSession(
      interaction.guildId,
      interaction.user.id,
      {
        roomNumber,
        step: 'AWAITING_DESCRIPTION'
      }
    );

    return true;
  }


  /*
   * 2. 파티 설명 제출
   */
  if (
    interaction.isModalSubmit() &&
    interaction.customId ===
      'recruit_setup_description'
  ) {
    /*
     * ★ 핵심!
     *
     * Discord는 interaction에
     * 빠른 초기 응답을 요구합니다.
     *
     * DB 처리보다 먼저 응답을 예약해서
     * Unknown interaction(10062) 위험을 줄입니다.
     */
    await interaction.deferReply({
      flags: MessageFlags.Ephemeral
    });


    const session = getSetupSession(
      interaction.guildId,
      interaction.user.id
    );

    if (!session) {
      await interaction.editReply(
        '⏰ 구인 설정 시간이 만료됐어요. 다시 명령어를 실행해주세요.'
      );

      return true;
    }

    /*
     * 멤버 / 방 설정 완료 여부 확인
     */
    if (
      session.step !== 'AWAITING_DESCRIPTION' ||
      !session.roomNumber ||
      !session.memberIds?.length ||
      (
        session.channelId &&
        session.channelId !== interaction.channelId
      )
    ) {
      await interaction.editReply(
        '❎ 구인 설정 정보가 완성되지 않았어요. 다시 명령어를 실행해주세요.'
      );

      return true;
    }

    const description =
      interaction.fields
        .getTextInputValue('recruit_description')
        .trim();

    if (!description) {
      await interaction.editReply(
        '❎ 파티 설명을 한 글자 이상 입력해주세요.'
      );

      return true;
    }


    /*
     * 최종 구인 생성
     */
    try {
      await createRecruitmentFromSession(
        interaction,
        session,
        description
      );

    } catch (error) {
      console.error(
        '❌ 구인 생성 실패:',
        error
      );

      try {
        await interaction.editReply(
          '❌ 구인 생성 중 오류가 발생했어요. 이미 구인글이 올라왔는지 확인하고, 필요하면 운영진에게 알려주세요.'
        );

      } catch (replyError) {
        console.error(
          '❌ 구인 오류 안내 실패:',
          replyError
        );
      }
    }

    return true;
  }


  return false;
}


module.exports = {
  handleRecruitSetupInteraction
};