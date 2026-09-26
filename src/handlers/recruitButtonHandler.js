const {
  getRecruitmentSnapshot,
  joinRecruitment,
  cancelRecruitment,
  addRecruitmentWatcher,
  getActiveWatchers,
  markWatchersNotified
} = require('../services/recruitService');

const {
  buildRecruitmentMessage,
  getRecruitmentTitle,
  getVoiceRoomLabel
} = require('../ui/recruitMessageBuilder');


function getRecruitmentId(
  customId
) {
  const parts =
    customId.split(':');

  const id =
    Number(parts[1]);

  if (
    !Number.isInteger(id) ||
    id <= 0
  ) {
    return null;
  }

  return id;
}


function getJumpUrl(
  recruitment
) {
  if (
    !recruitment.guild_id ||
    !recruitment.channel_id ||
    !recruitment.message_id
  ) {
    return null;
  }

  return (
    'https://discord.com/channels/' +
    `${recruitment.guild_id}/` +
    `${recruitment.channel_id}/` +
    `${recruitment.message_id}`
  );
}


async function notifyVacancyWatchers(
  client,
  snapshot
) {
  const recruitment =
    snapshot.recruitment;

  const watcherIds =
    getActiveWatchers(
      recruitment.id
    );

  if (
    watcherIds.length === 0
  ) {
    return;
  }

  const jumpUrl =
    getJumpUrl(
      recruitment
    );

  const title =
    getRecruitmentTitle(
      recruitment,
      false
    );

  const voiceRoom =
    getVoiceRoomLabel(
      recruitment
    );

  for (
    const userId of watcherIds
  ) {
    try {
      const user =
        await client.users.fetch(
          userId
        );

      const lines = [
        '🔔 **희희낙락 구인 알림** 🔔',
        '',
        `${voiceRoom}에 자리가 생겼습니다!`,
      ];

      if (jumpUrl) {
        lines.push(
          `👉 **[참여하러가기](${jumpUrl})**`
        );
      }

      lines.push(
        '',
        title,
        `👥 현재 인원 ${snapshot.memberCount} / ${recruitment.capacity}`,
        `🕘 시작 예정 ${recruitment.start_time}`
      );

      await user.send(
        lines.join('\n')
      );

    } catch (error) {
      console.warn(
        `⚠️ 자리 알림 DM 전송 실패: ${userId}`,
        error.message
      );
    }
  }

  /*
   * 자리 알림은 한 번의 빈자리 발생에 대해
   * 1회 발송하는 방식입니다.
   *
   * 다음 FULL 상태에서 다시 알림을 받고 싶으면
   * 🔔 버튼을 다시 누르면 됩니다.
   */
  markWatchersNotified(
    recruitment.id,
    watcherIds
  );
}


async function handleJoin(
  interaction,
  recruitmentId
) {
  const result =
    joinRecruitment(
      recruitmentId,
      interaction.user.id
    );

  if (
    result.code ===
    'NOT_FOUND'
  ) {
    await interaction.reply({
      content:
        '❎ 존재하지 않는 구인입니다.',
      ephemeral: true,
    });

    return;
  }

  if (
    result.code ===
    'CLOSED'
  ) {
    await interaction.reply({
      content:
        '❎ 종료된 구인입니다.',
      ephemeral: true,
    });

    return;
  }

  if (
    result.code ===
    'ALREADY_JOINED'
  ) {
    await interaction.reply({
      content:
        '✅ 이미 이 구인에 참여 중이에요!',
      ephemeral: true,
    });

    return;
  }

  if (
    result.code ===
    'FULL'
  ) {
    const snapshot =
      getRecruitmentSnapshot(
        recruitmentId
      );

    if (snapshot) {
      await interaction.update(
        buildRecruitmentMessage(
          snapshot,
          {
            pingHere: false,
          }
        )
      );
    } else {
      await interaction.reply({
        content:
          '❎ 모집이 이미 완료되었습니다.',
        ephemeral: true,
      });

      return;
    }

    await interaction.followUp({
      content:
        '😥 방금 모집이 완료됐어요. 🔔 자리나면 알림을 이용해주세요!',
      ephemeral: true,
    });

    return;
  }

  if (
    result.code !==
    'JOINED'
  ) {
    await interaction.reply({
      content:
        '❎ 참여 처리 중 문제가 발생했습니다.',
      ephemeral: true,
    });

    return;
  }

  await interaction.update(
    buildRecruitmentMessage(
      result.snapshot,
      {
        pingHere: false,
      }
    )
  );

  if (
    result.snapshot.isFull
  ) {
    await interaction.followUp({
      content:
        '✅ 참여 완료! 현재 인원이 모두 찼어요. 🎉',
      ephemeral: true,
    });
  } else {
    await interaction.followUp({
      content:
        `✅ 참여 완료! 현재 ${result.snapshot.memberCount} / ${result.snapshot.recruitment.capacity}명입니다.`,
      ephemeral: true,
    });
  }
}


async function handleCancel(
  client,
  interaction,
  recruitmentId
) {
  const result =
    cancelRecruitment(
      recruitmentId,
      interaction.user.id
    );

  if (
    result.code ===
    'NOT_FOUND'
  ) {
    await interaction.reply({
      content:
        '❎ 존재하지 않는 구인입니다.',
      ephemeral: true,
    });

    return;
  }

  if (
    result.code ===
    'NOT_JOINED'
  ) {
    await interaction.reply({
      content:
        '❎ 현재 참여 중인 구인이 아닙니다 ❎',
      ephemeral: true,
    });

    return;
  }

  if (
    result.code !==
    'CANCELLED'
  ) {
    await interaction.reply({
      content:
        '❎ 취소 처리 중 문제가 발생했습니다.',
      ephemeral: true,
    });

    return;
  }

  await interaction.update(
    buildRecruitmentMessage(
      result.snapshot,
      {
        pingHere: false,
      }
    )
  );

  await interaction.followUp({
    content:
      '❎ 구인 참여를 취소했습니다.',
    ephemeral: true,
  });

  /*
   * FULL 상태에서 한 명이 빠져
   * 실제 빈자리가 생긴 경우에만
   * 대기자에게 DM을 보냅니다.
   */
  if (
    result.becameAvailable
  ) {
    await notifyVacancyWatchers(
      client,
      result.snapshot
    );
  }
}


async function handleNotify(
  interaction,
  recruitmentId
) {
  const result =
    addRecruitmentWatcher(
      recruitmentId,
      interaction.user.id
    );

  if (
    result.code ===
    'NOT_FOUND'
  ) {
    await interaction.reply({
      content:
        '❎ 존재하지 않는 구인입니다.',
      ephemeral: true,
    });

    return;
  }

  if (
    result.code ===
    'ALREADY_JOINED'
  ) {
    await interaction.reply({
      content:
        '✅ 이미 이 구인에 참여 중이에요!',
      ephemeral: true,
    });

    return;
  }

  if (
    result.code ===
    'NOT_FULL'
  ) {
    await interaction.reply({
      content:
        '✅ 지금은 자리가 있어요! 바로 참여해주세요.',
      ephemeral: true,
    });

    return;
  }

  if (
    result.code ===
    'ALREADY_WATCHING'
  ) {
    await interaction.reply({
      content:
        '🔔 이미 자리 알림을 신청하셨어요!',
      ephemeral: true,
    });

    return;
  }

  if (
    result.code ===
    'WATCHING'
  ) {
    await interaction.reply({
      content:
        '🔔 자리가 생기면 알려드릴게요!',
      ephemeral: true,
    });

    return;
  }

  await interaction.reply({
    content:
      '❎ 자리 알림 등록 중 문제가 발생했습니다.',
    ephemeral: true,
  });
}


async function handleRecruitButtonInteraction(
  client,
  interaction
) {
  if (
    !interaction.isButton()
  ) {
    return false;
  }

  const customId =
    interaction.customId;

  const isRecruitButton =
    customId.startsWith(
      'recruit_join:'
    ) ||
    customId.startsWith(
      'recruit_cancel:'
    ) ||
    customId.startsWith(
      'recruit_notify:'
    );

  if (!isRecruitButton) {
    return false;
  }

  const recruitmentId =
    getRecruitmentId(
      customId
    );

  if (!recruitmentId) {
    await interaction.reply({
      content:
        '❎ 잘못된 구인 정보입니다.',
      ephemeral: true,
    });

    return true;
  }

  if (
    customId.startsWith(
      'recruit_join:'
    )
  ) {
    await handleJoin(
      interaction,
      recruitmentId
    );

    return true;
  }

  if (
    customId.startsWith(
      'recruit_cancel:'
    )
  ) {
    await handleCancel(
      client,
      interaction,
      recruitmentId
    );

    return true;
  }

  if (
    customId.startsWith(
      'recruit_notify:'
    )
  ) {
    await handleNotify(
      interaction,
      recruitmentId
    );

    return true;
  }

  return false;
}


module.exports = {
  handleRecruitButtonInteraction,
};