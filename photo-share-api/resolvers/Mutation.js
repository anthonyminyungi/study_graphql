const { authorizeWithGithub, uploadStream } = require('../lib');
const fetch = require('node-fetch');
const path = require('path');

module.exports = {
  async addFakeUsers(root, { count }, { db }) {
    const randomUserApi = `https://randomuser.me/api/?results=${count}`;
    const { results } = await fetch(randomUserApi).then(res => res.json());

    const users = results.map(result => ({
      githubLogin: result.login.username,
      name: `${result.name.first} ${result.name.last}`,
      avatar: result.picture.thumbnail,
      githubToken: result.login.sha1,
    }));

    await db.collection('users').insertMany(users);

    return users;
  },

  async fakeUserAuth(parent, { githubLogin }, { db }) {
    const user = await db.collection('users').findOne({ githubLogin });

    if (!user) {
      throw new Error(`Cannot find user with githubLogin "${githubLogin}"`);
    }

    return {
      token: user.githubToken,
      user,
    };
  },

  async postPhoto(root, args, { db, currentUser, pubsub }) {
    if (!currentUser) {
      throw new Error('only an authorized user can post a photo');
    }

    const newPhoto = {
      ...args.input,
      userID: currentUser.githubLogin,
      created: new Date(),
    };

    const { insertedIds } = await db.collection('photos').insert(newPhoto);
    newPhoto.id = insertedIds[0];

    const toPath = path.join(
      __dirname,
      '..',
      'assets',
      'photos',
      `${photo.id}.jpg`
    );

    const { stream } = await args.input.file;
    await uploadStream(input.file, toPath);

    pubsub.publish('photo-added', { newPhoto });

    return newPhoto;
  },

  async githubAuth(parent, { code }, { db }) {
    let {
      message,
      access_token,
      avatar_url,
      login,
      name,
    } = await authorizeWithGithub({
      client_id: process.env.CLIENT_ID,
      client_secret: process.env.CLIENT_SECRET,
      code,
    });

    if (message) {
      throw new Error(message);
    }

    let latestUserInfo = {
      name,
      githubLogin: login,
      githubToken: access_token,
      avatar: avatar_url,
    };

    const {
      ops: [user],
    } = await db
      .collection('users')
      .replaceOne({ githubLogin: login }, latestUserInfo, { upsert: true });
    return { user, token: access_token };
  },
};
