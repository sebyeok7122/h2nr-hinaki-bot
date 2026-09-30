const {
  getRecruitmentSnapshot,
  joinRecruitment,
  cancelRecruitment,
  addRecruitmentWatcher,

  claimNextWatchersForOpenSlots,
  removeRecruitmentWatcher,

  expireWatchersForRecruitment,
  getRecruitmentIdsNeedingQueueProcessing
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


/*
 * 구인 원본 메시지를 최신 상태로 갱신합니다.
 *
 * 대기순번이나 우선 참여 상태가
 * 바뀔 때 사용합니다.
 */
async function refreshRecruitmentMessage(
  client,
  recruitmentId
) {
  const snapshot =
    getRecruitmentSnapshot(
      recruitmentId
    );


  if (!snapshot) {
    return null;
  }


  const recruitment =
    snapshot.recruitment;


  if (
    !recruitment.channel_id ||
    !recruitment.message_id
  ) {
    return snapshot;
  }


  try {
    const channel =
      await client.channels.fetch(
        recruitment.channel_id
      );


    if (
      !channel ||
      !channel.isTextBased()
    ) {
      return snapshot;
    }


    const message =
      await channel.messages.fetch(
        recruitment.message_id
      );


    await message.edit(
      buildRecruitmentMessage(
        snapshot,
        {
          pingHere: false,
        }
      )
    );

  } catch (error) {
    console.warn(
      `⚠️ 구인 메시지 갱신 실패: ${recruitmentId}`,
      error.message
    );
  }


  return snapshot;
}


/*
 * 우선권이 만료된 사람에게 안내합니다.
 */
async function notifyExpiredWatcher(
  client,
  userId,
  snapshot
) {
  try {
    const user =
      await client.users.fetch(
        userId
      );


    const recruitment =
      snapshot?.recruitment;


    const lines = [
      '⏰ **희희낙락 자리알림 우선권 만료**',
      '',
      '3분 동안 참여가 확인되지 않아',
      '다음 대기자에게 순번이 넘어갔어요.',
    ];


    if (recruitment) {
      const jumpUrl =
        getJumpUrl(
          recruitment
        );


      if (jumpUrl) {
        lines.push(
          '',
          `👉 **[구인글 확인하기](${jumpUrl})**`
        );
      }
    }


    await user.send(
      lines.join('\n')
    );

  } catch (error) {
    console.warn(
      `⚠️ 우선권 만료 DM 전송 실패: ${userId}`,
      error.message
    );
  }
}


/*
 * 실제 자리 발생 DM
 *
 * 이 DM은 현재 우선순위자에게만 갑니다.
 */
async function sendPriorityDm(
  client,
  userId,
  snapshot
) {
  const recruitment =
    snapshot.recruitment;


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


  const user =
    await client.users.fetch(
      userId
    );


  const lines = [
    '🔔 **희희낙락 구인 알림** 🔔',
    '',
    `${voiceRoom}에 자리가 생겼습니다!`,
    '',
    '현재 회원님 차례입니다. 💛',
    '**3분 동안 우선 참여권**이 적용됩니다.',
    '',
    '3분 안에 구인글의 ✅ 참여를 눌러주세요.',
    '시간이 지나면 다음 대기자에게 순번이 넘어갑니다.',
  ];


  if (jumpUrl) {
    lines.push(
      '',
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
}


/*
 * ─────────────────────────────
 * 자리 대기열 처리
 * ─────────────────────────────
 *
 * 1. 3분 지난 우선권 제거
 * 2. 빈자리 확인
 * 3. 필요한 수만큼 앞순번에게 우선권 부여
 * 4. 해당 사람에게만 DM
 */
async function processRecruitmentQueue(
  client,
  recruitmentId
) {
  let snapshot =
    getRecruitmentSnapshot(
      recruitmentId
    );


  if (!snapshot) {
    return;
  }


  /*
   * 먼저 노쇼/시간초과 인원을 제거합니다.
   */
  const expiredUserIds =
    expireWatchersForRecruitment(
      recruitmentId
    );


  if (
    expiredUserIds.length > 0
  ) {
    for (
      const userId of
        expiredUserIds
    ) {
      await notifyExpiredWatcher(
        client,
        userId,
        snapshot
      );
    }
  }


  /*
   * 현재 빈자리 수에 맞춰
   * 다음 순번에게 우선권을 부여합니다.
   */
  const claimedUserIds =
    claimNextWatchersForOpenSlots(
      recruitmentId
    );


  snapshot =
    getRecruitmentSnapshot(
      recruitmentId
    );


  if (!snapshot) {
    return;
  }


  /*
   * 우선권을 새로 받은 사람에게만
   * DM을 전송합니다.
   */
  let hadDmFailure = false;


  for (
    const userId of
      claimedUserIds
  ) {
    try {
      await sendPriorityDm(
        client,
        userId,
        snapshot
      );


      console.log(
        `🔔 [자리알림] 구인 ${recruitmentId} · ${userId} 우선권 시작`
      );

    } catch (error) {
      console.warn(
        `⚠️ 자리 알림 DM 전송 실패: ${userId}`,
        error.message
      );


      /*
       * DM을 받을 수 없는 사람에게
       * 3분 우선권을 유지하면
       * 파티가 이유 없이 막힐 수 있으므로
       * 즉시 대기열에서 제외합니다.
       */
      removeRecruitmentWatcher(
        recruitmentId,
        userId
      );


      hadDmFailure = true;
    }
  }


  /*
   * 대기열 상태가 바뀌었으므로
   * 구인글의 1,2,3순위 표시도 갱신합니다.
   */
  await refreshRecruitmentMessage(
    client,
    recruitmentId
  );


  /*
   * DM 실패자가 있었다면
   * 바로 다음 순번을 처리합니다.
   */
  if (
    hadDmFailure
  ) {
    await processRecruitmentQueue(
      client,
      recruitmentId
    );
  }
}


/*
 * 봇이 주기적으로 호출할 전체 대기열 확인
 *
 * 3분이 지난 노쇼를 자동으로 넘기기 위해
 * index.js에서 반복 호출하게 됩니다.
 */
async function processAllRecruitmentQueues(
  client
) {
  const recruitmentIds =
    getRecruitmentIdsNeedingQueueProcessing();


  for (
    const recruitmentId of
      recruitmentIds
  ) {
    try {
      await processRecruitmentQueue(
        client,
        recruitmentId
      );

    } catch (error) {
      console.error(
        `❌ 자리 대기열 처리 오류: ${recruitmentId}`,
        error
      );
    }
  }
}


async function handleJoin(
  client,
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


  /*
   * 대기순번자가 우선 참여 중이면
   * 다른 사람이 자리를 가져갈 수 없습니다.
   */
  if (
    result.code ===
    'QUEUE_RESERVED'
  ) {
    await interaction.reply({
      content:
        '🔔 현재 자리알림 대기자의 **우선 참여시간**입니다.\n' +
        '대기자의 우선권이 종료되거나 순번이 넘어간 뒤 참여해주세요!',
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


  /*
   * 참여 후에도 빈자리가 남아있다면
   * 다음 대기순번이 필요한지 확인합니다.
   */
  await processRecruitmentQueue(
    client,
    recruitmentId
  );
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
   * FULL 상태에서 사람이 빠져
   * 빈자리가 생겼다면
   * 1순위부터 우선권을 시작합니다.
   */
  if (
    result.becameAvailable
  ) {
    await processRecruitmentQueue(
      client,
      recruitmentId
    );
  }
}


async function handleNotify(
  client,
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
        result.position
          ? `🔔 이미 자리알림 대기 **${result.position}순위**로 등록되어 있어요!`
          : '🔔 이미 자리알림을 신청하셨어요!',

      ephemeral: true,
    });

    return;
  }


  if (
    result.code ===
    'WATCHING'
  ) {
    /*
     * 구인글에도 즉시
     * 대기자 순번을 표시합니다.
     */
    if (
      result.snapshot
    ) {
      try {
        await interaction.message.edit(
          buildRecruitmentMessage(
            result.snapshot,
            {
              pingHere: false,
            }
          )
        );

      } catch (error) {
        console.warn(
          '⚠️ 대기순번 메시지 갱신 실패:',
          error.message
        );
      }
    }


    await interaction.reply({
      content:
        result.position
          ? `🔔 자리알림 **${result.position}순위**로 등록되었습니다!\n자리가 생기면 순서대로 DM을 보내드릴게요.`
          : '🔔 자리알림에 등록되었습니다!',

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
      client,
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
      client,
      interaction,
      recruitmentId
    );

    return true;
  }


  return false;
}


module.exports = {
  handleRecruitButtonInteraction,
  processRecruitmentQueue,
  processAllRecruitmentQueues,
};