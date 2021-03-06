import { Command, CommandData } from '@dyno.gg/dyno-core';
import * as eris from '@dyno.gg/eris';

export default class Play extends Command {
	public group        : string   = 'Music';
	public aliases      : string[] = ['play', 'yt', 'youtube'];
	public description  : string   = 'Add a song to queue and play';
	public defaultUsage : string   = 'play [url]';
	public expectedArgs : number   = 0;
	public cooldown     : number   = 6000;
	public disableDM    : boolean  = true;

	public example: string[] = [
		'play https://www.youtube.com/watch?v=dQw4w9WgXcQ',
		'play Never Gonna Give You Up',
	];
	public usage: string[] = [
		'play [url]',
		'play [song name]',
		'play [number]',
	];

	// tslint:disable-next-line:cyclomatic-complexity
	public async execute({ message, args, guildConfig }: CommandData) {
		const music = await this.getModule('Music');
		const guild = (<eris.GuildChannel>message.channel).guild;

		try {
			await this.canPlay(message, guildConfig);
		} catch (err) {
			return this.error(message.channel, err);
		}

		const voiceChannel = this.client.getChannel(message.member.voiceState.channelID);
		if (!voiceChannel) {
			return this.error(message.channel, 'You should be in a voice channel first.');
		}

		let queue;

		if (!args.length || (!isNaN(args[0]) && args.length === 1)) {
			try {
				queue = await music.getQueue(guild.id);
				if (!queue || !queue.length) {
					return this.sendMessage(message.channel, `The queue is empty, add a song using ${guildConfig.prefix || '?'}play [song name or link]`);
				}
			} catch (err) {
				this.logger.error(err);
			}
		}

		let player = music.getPlayer(guild);
		if (!player) {
			let textChannel = message.channel;
			if (guildConfig.music && guildConfig.music.channel) {
				const channel = this.client.getChannel(message.channel.id);
				if (channel) {
					textChannel = channel;
				}
			}

			try {
				player = await music.join(voiceChannel, textChannel, guildConfig);
			} catch (err) {
				this.logger.warn(err);
				return this.error(message.channel, err);
			}
		}

		// no args, start playing
		if (!args || !args.length) {
			if (player.playing) {
				return this.sendMessage(message.channel, `A song is already playing, use skip instead.`, { deleteAfter: 9000 });
			}

			return player.play(guildConfig, { channel: message.channel }).catch((err: string|Error) => {
				return this.playError(message, err);
			});
		}

		// play by index
		if (!isNaN(args[0]) && args.length === 1) {
			try {
				if (parseInt(args[0], 10) > queue.length) {
					return this.error(message.channel, 'That song is not in queue.');
				}

				return player.playQueueItem(guildConfig, args[0]).catch((err: string|Error) => {
					return this.playError(message, err);
				});
			} catch (err) {
				this.logger.error(err);
				return this.error(message.channel, `Something went wrong.`);
			}
		}

		return player.play(guildConfig, { search: args.join(' '), channel: message.channel }).catch((err: string|Error) => {
			return this.playError(message, err);
		});
	}

	private async canPlay(message: eris.Message, guildConfig: any) {
		const music = await this.getModule('Music');
		const guild = (<eris.GuildChannel>message.channel).guild;

		if (!music.canCommand(message)) {
			return Promise.reject(`You don't have permissions to use that command.`);
		}

		if (!music.canPlayInChannel(message)) {
			const musicChannel = guild.channels.get(guildConfig.music.channel);
			if (musicChannel) {
				return Promise.reject(`Music commands are limited to the <#${musicChannel.id}> channel`);
			}
			return Promise.reject(`Music commands can't be played here.`);
		}

		if (await music.isStreamLimited(guild)) {
			return Promise.reject([
				`**Sorry, our music servers are currently at peak capacity <:DynoSweats:360218996001472513>**`,
				`**You can try again in a little while, or upgrade to premium if you want to use that feature right now.**`,
			].join('\n'));
		}

		return Promise.resolve();
	}

	private playError(message: eris.Message, err: string|Error) {
		if (err === '60m') {
			if (this.isServerMod(message.member, message.channel)) {
				const minutes = (this.config.maxSongLength || 5400) / 60;
				return this.sendMessage(message.channel, [
					`The song is longer than ${minutes} minutes, this is limited for performance purposes.`,
					`You can upgrade Dyno to enable this feature and more at <${this.config.site.host}/upgrade>`,
				].join('\n'));
			}

			return this.sendMessage(message.channel, `The song is longer than 60 minutes.`);
		}

		this.logger.error(err);
		return this.error(message.channel, `An error occurred: ${err}`);
	}
}
