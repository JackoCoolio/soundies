const Discord = require('discord.js');
const client = new Discord.Client();
const ytdl = require('ytdl-core');
require('dotenv').config();

var servers = {};

Discord.TextChannel.prototype.sendTimeout = function(message, time) {
  this.send(message).then((m) => {
    setTimeout(function() {m.delete().then(console.log('Auto deleted message.')).catch(console.error)},time);
  }).catch(console.error);
}

client.on('ready', () => {

  client.guilds.forEach((guild, id, guilds) => {
    if (!servers[guild]) servers[guild] = {
      guild: guild
    };
    let server = servers[guild];

    if (!server.queue) server.queue = {
      index: 0,
      playing: false,
      playlist: []
    };

    let queue = server.queue;

    let chan = guild.channels.find('name','play-history');
    if (chan) {
      server.history_channel = chan;
    } else {
      guild.owner.user.sendMessage(`Your guild, ${guild.name}, does not have a \`play-history\` channel!`);
    }
  });

  console.log('Ready!');
});

client.on('message', msg => {
  if (msg.author.bot) return;
  if (msg.content.toLowerCase() == '?') return;

  if (!msg.content.startsWith('?')) return;
  if (msg.channel.type == 'dm') {
    console.log("[DM]" + msg.author.username + ": " + msg.content);
  } else {
    console.log('[Guild]' + msg.author.username + ": " + msg.content);
  }

  let cmd = msg.content.split(' ')[0].slice(1).toLowerCase();
  let params = msg.content.split(' ').slice(1);
  let server = servers[msg.guild];
  let queue = server.queue;
  let playlist = queue.playlist;

  if (cmd == 'add') {
    if (!params[0]) return msg.channel.send('Use `add <link>`');

    let link = params[0];

    if (!isYoutubeLink(link)) return msg.channel.sendTimeout('That is not a valid YouTube link.',2000);

    getTitle(link, (err, info) => {
      playlist.push({
        url: link,
        requester: msg.author,
        title: info.title
      });

      if (!queue.playing) {
        playQueue(msg.member.voiceChannel, server);
      }

      msg.channel.sendTimeout(`Added \`${info.title}\` to the queue.`,2000);
    });
  } else if (cmd == 'clear') {
    queue = {};
    msg.channel.sendTimeout('Queue cleared!',2000);
    if (queue.playing) msg.channel.sendTimeout('The currently playing song will continue.',2000);
  } else if (cmd == 'skip') {
    if (server.dispatcher) {
      server.dispatcher.end();
      msg.channel.sendTimeout('Skipped the currently playing song.');
    } else {
      msg.channel.sendTimeout('No song is playing!');
    }
  } else if (cmd == 'stop') {
    queue.playing = false;
    if (msg.guild.voiceConnection) msg.guild.voiceConnection.disconnect();
  } else if (cmd == 'start') {
    playQueue(msg.member.voiceChannel, server);
  }
  msg.delete();
});

client.on('error', console.error);

function isYoutubeLink(link) {
  var succeeded = true;
  try {
    ytdl.getInfo(link, {seek: 0, volume: 1}, function(err,info) {
      if (err) succeeded = false;
    });
  } catch (e) {
    succeeded = false;
  }
  return succeeded;
}

function getTitle(link, callback) {
  try {
    ytdl.getInfo(link, {seek: 0, volume: 1}, callback);
  } catch (e) {console.error(e)}
}

function playQueue(channel, serverData) {
  let queue = serverData.queue;
  if (queue.length == 0) return;
  queue.playing = true;
  playSong(queue.playlist[queue.index], channel, serverData);
}

function playSong(song, channel, serverData) {
  if (!song) {
    serverData.dispatcher.end();
    serverData.queue.playing = false;
    try {
      serverData.guild.me.voiceChannel.leave();
    } catch (e) {console.error(e)}
  }
  channel.join().then(connection => {
    serverData.dispatcher = connection.playStream(ytdl(song.url, {filter: 'audioonly'}));

    historyEmbed(serverData, song);

    serverData.dispatcher.on('end', () => {
      serverData.queue.index++;
      if (serverData.queue.playing)
        playSong(serverData.queue.playlist[serverData.queue.index], channel, serverData);
    });
  }).catch(console.error);
}

function historyEmbed(serverData, song) {
  let histChannel = serverData.history_channel;
  if (histChannel) {
    let embed = new Discord.RichEmbed();
    embed.setDescription(`requested by ${song.requester.username}`);
    embed.setColor(
      [
        Math.floor(Math.random() * 256),
        Math.floor(Math.random() * 256),
        Math.floor(Math.random() * 256)
      ]
    );
    embed.setTitle(song.title);
    histChannel.send(embed).then(m => console.log('Playing: ' + info.title)).catch(console.error);
  }
}

client.login(process.env.BOT_TOKEN);
