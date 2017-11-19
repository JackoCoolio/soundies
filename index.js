const Discord = require('discord.js');
const client = new Discord.Client();
const ytdl = require('ytdl-core');
const fs = require('fs');
require('dotenv').config();

var servers = {};
var aliases;

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

    aliases = JSON.parse(fs.readFileSync('./aliases.json'));
    if (!aliases[guild]) aliases[guild] = {};
  });

  updateAliases();

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
  let aliasList= aliases[msg.guild];

  if (cmd == 'add') {
    addToQueue(url, server);
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
    if (queue.playing) {
      if (params[0] == 'override') {
        playQueue(msg.member.voiceChannel, server);
      } else {
        msg.channel.sendTimeout('Queue is already playing!');
      }
    } else {
      playQueue(msg.member.voiceChannel, server);
    }

  } else if (cmd == 'help') {
    let embed = new Discord.RichEmbed()
    .setTitle('Help')
    .setDescription('?help')
    .addField('add <link>','Add a link to the queue.')
    .addField('clear','Clear the queue.')
    .addField('skip','Skip the currently playing song.')
    .addField('stop','Stop playing.')
    .addField('start','Start the queue. Using `?add` will do the same thing.')
    .addField('alias <command> <link>', 'Create a command for your server.')
    .addField('help','Display this message.');
    if (aliases.keys().length > 0)
      embed.addField(`+${aliases.keys().length} aliases...`, 'Use `?aliases` to get a list of all of them!');

    msg.channel.send(embed).then(() => {console.log('Sent help message.')}).catch(console.error);
  } else if (cmd == 'replay') {
    if (!queue.previousSong) return msg.channel.sendTimeout('There is no song to replay!');
    queue.playlist.push(queue.previousSong);
    if (!queue.playing)
      playQueue(msg.member.voiceChannel, server);
  } else if (cmd == 'alias') {
    let alias = params.shift();

    let link = params.join(' ');

    if (!isYoutubeLink(link)) return msg.channel.sendTimeout('That is not a valid YouTube link.',2000);

    aliasList[alias] = link;
    updateAliases();
  } else if (cmd == 'aliases') {
    msg.channel.sendTimeout('`?aliases` is currently under construction!');
  }

  if (aliases.hasOwnProperty(cmd)) {
    addToQueue(aliases[cmd], server);
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
    if (!song.url) serverData.dispatcher.end();
    serverData.dispatcher = connection.playStream(ytdl(song.url, {filter: 'audioonly'}));

    historyEmbed(serverData, song);

    serverData.dispatcher.on('end', () => {
      serverData.queue.index++;
      serverData.queue.previousSong = song;
      if (serverData.queue.playing)
        playSong(serverData.queue.playlist[serverData.queue.index], channel, serverData);
    });
  }).catch(console.error);
}

function historyEmbed(serverData, song) {
  let histChannel = serverData.history_channel;
  if (histChannel) {
    let embed = new Discord.RichEmbed()
    .setColor(
      [
        Math.floor(Math.random() * 256),
        Math.floor(Math.random() * 256),
        Math.floor(Math.random() * 256)
      ]
    )
    .setTitle(song.title)
    .setFooter(`Requested by ${song.requester.username}`,song.requester.user.avatarURL)
    .setURL(song.url);
    histChannel.send(embed).then(m => console.log('Playing: ' + song.title)).catch(console.error);
  }
}

function updateAliases() {
  fs.writeFileSync('./aliases.json', JSON.stringify(aliases));
}

function addToQueue(url, server) {
  if (!url) return msg.channel.send('Use `add <link>`');

  let queue = server.queue;
  let playlist = queue.playlist;
  let link = url;

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
}

client.login(process.env.BOT_TOKEN);
