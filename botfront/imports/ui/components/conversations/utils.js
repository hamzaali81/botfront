import moment from 'moment';
import ExampleUtils from '../utils/ExampleUtils';

export function generateTurns(tracker, debug = false) {
    const turns = [];
    let currentTurn = {
        userSays: null,
        botResponses: [],
    };
    const buttonValues = {};
    tracker.events.forEach((event) => {
        const type = event.event;

        if (type === 'user' && !!event.text) {
            // The text check here is to remove the null userUttered events that are triggered by reminders
            const example = ExampleUtils.fromParseData(event.parse_data);

            if (example.text.startsWith('/')) delete example.text;
            if (!example.text && buttonValues[example.intent]) { // use remembered button title-payload mapping
                example.text = `<${buttonValues[example.intent]}>`;
            }

            const userSays = {
                example,
                timestamp: moment.unix(event.timestamp),
                confidence: ExampleUtils.getConfidence(event.parse_data),
            };

            if (!currentTurn.userSays && currentTurn.botResponses.length === 0) {
                // First piece of dialogue
                currentTurn = {
                    ...currentTurn,
                    userSays,
                    messageId: event.message_id,
                };
            } else {
                // Finish previous turn and init a new one
                turns.push(currentTurn);
                currentTurn = {
                    userSays,
                    botResponses: [],
                    messageId: event.message_id,
                };
            }
        } else if (type === 'bot') {
            currentTurn.botResponses.push({
                type: 'bot_data',
                text: event.text,
                data: event.data,
            });
            (event.data.buttons || []).forEach((b) => { // remember button title-payload mapping
                buttonValues[b.payload.replace(/^\//, '')] = b.title;
            });
        } else if (debug) {
            // only insert if user has uttered something
            currentTurn.botResponses.push({
                type: 'event',
                data: event,
            });
        }
    });

    if (currentTurn.userSays || currentTurn.botResponses.length !== 0) {
        turns.push(currentTurn);
    }

    return turns;
}

const parseBotResponse = ({ text, data: { buttons } = {} } = {}) => {
    let line = `- ${text}`;
    if (buttons) {
        line += `\n${buttons.reduce((acc, curr) => `${acc} <${curr.title}>`, '  ')}`;
    }
    return line;
};

export function formatConversationInMd(conversation) {
    const { userId, _id, tracker } = conversation;
    const turns = generateTurns(tracker);
    const convLen = turns.length;
    if (!convLen) return '';
    let time;
    if (turns[0].userSays) {
        const firstTime = turns[0].userSays.timestamp;
        time = `${firstTime.toString()}${
            convLen > 1 ? ` - ${turns[convLen - 1].userSays.timestamp}` : ''
        }`;
    }
    const header = `# Conversation ${_id}${time ? ` (${time})` : ''}${
        userId ? `\n## User ${userId}` : ''
    }`;
    const body = turns
        .map(({ userSays, botResponses }) => {
            const userLines = userSays
                ? [`* ${userSays.example.text || `/${userSays.example.intent}`}`]
                : [];
            const botLines = botResponses.map(parseBotResponse);
            return [...userLines, ...botLines].join('\n');
        })
        .join('\n');
    return `${header}\n\n${body}`;
}

export function formatConversationsInMd(conversations) {
    return conversations.map(formatConversationInMd).join('\n\n');
}
