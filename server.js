require("dotenv").config();
const express = require("express");
const app = express();
const session = require("express-session");
const jwt = require("jsonwebtoken");
const Sequelize = require("sequelize");
const SequelizeStore = require("connect-session-sequelize")(session.Store);

const Op = Sequelize.Op;

// if (process.env.NODE_ENV === "development") {
//   const cors = require("cors");
//   app.use(cors());
//   app.use((req, res, next) => {
//     // res.header("Access-Control-Allow-Origin", "http://localhost:3000");
//     res.header("Access-Control-Allow-Origin", "http://localhost:3000/planner");
//     res.header("Access-Control-Allow-Credentials", "true");
//     next();
//   });
// }

const HOME =
  process.env.NODE_ENV === "development" ? "http://localhost:3000" : "/";

const makeid = (length) => {
  let result = "";
  const characters = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
  const numbers = "0123456789";
  for (var i = 0; i < length; i++) {
    Math.floor(Math.random() * 20) + 1 > 16
      ? (result += characters.charAt(
          Math.floor(Math.random() * characters.length)
        ))
      : (result += numbers.charAt(Math.floor(Math.random() * numbers.length)));
  }
  return result;
};

app.use(express.json());

const db = new Sequelize(
  process.env.database,
  process.env.user,
  process.env.password,
  {
    dialect: "postgres",
    host: "localhost",
    pool: {
      max: 5,
      min: 0,
      acquire: 30000,
      idle: 10000,
    },
  }
);

const sessionStore = new SequelizeStore({ db: db });

const User = db.define("user", {
  oauthToken: {
    type: Sequelize.TEXT,
    unique: true,
    allowNull: false,
  },
  username: {
    type: Sequelize.STRING(22),
    unique: true,
    allowNull: false,
  },
  isActive: {
    type: Sequelize.BOOLEAN,
    defaultValue: true,
    allowNull: false,
  },
  isStaff: {
    type: Sequelize.BOOLEAN,
    defaultValue: false,
    allowNull: false,
  },
  discord: {
    type: Sequelize.STRING(25),
  },
});

const Guide = db.define("guide", {
  category: {
    type: Sequelize.SMALLINT,
    allowNull: false,
  },
  title: {
    type: Sequelize.STRING(128),
    allowNull: false,
  },
  description: {
    type: Sequelize.STRING(256),
  },
  markdown: {
    type: Sequelize.TEXT,
  },
  likeSum: {
    type: Sequelize.INTEGER,
    allowNull: false,
    defaultValue: 0,
  },
});

const ClassGuide = db.define("classguide", {
  skills: {
    type: Sequelize.JSONB,
    allowNull: false,
  },
  main: {
    type: Sequelize.SMALLINT,
    allowNull: false,
  },
  sub: {
    type: Sequelize.SMALLINT,
    allowNull: false,
  },
  mainVersion: {
    type: Sequelize.SMALLINT,
    allowNull: false,
  },
  subVersion: {
    type: Sequelize.SMALLINT,
    allowNull: false,
  },
  mainLvl: {
    type: Sequelize.SMALLINT,
    allowNull: false,
  },
  subLvl: {
    type: Sequelize.SMALLINT,
    allowNull: false,
  },
  mainCOSP: {
    type: Sequelize.SMALLINT,
    allowNull: false,
  },
  subCOSP: {
    type: Sequelize.SMALLINT,
    allowNull: false,
  },
  mag: {
    type: Sequelize.JSONB,
    allowNull: false,
  },
  classBoosts: {
    type: Sequelize.ARRAY(Sequelize.BOOLEAN),
    allowNull: false,
  },
  race: {
    type: Sequelize.SMALLINT,
    allowNull: false,
  },
  gender: {
    type: Sequelize.SMALLINT,
    allowNull: false,
  },
});

User.hasMany(Guide, { foreignKey: { allowNull: false } });
Guide.belongsTo(User, { foreignKey: { allowNull: false } });
Guide.hasMany(ClassGuide, { foreignKey: { allowNull: false } });
ClassGuide.belongsTo(Guide, { foreignKey: { allowNull: false } });

sessionStore.sync();
// db.sync().catch((err) => console.log(err));
db.sync({ force: true }).catch((err) => console.log(err));

app.use(
  session({
    secret: process.env.sessionsecret,
    store: sessionStore,
    resave: false,
    saveUninitialized: false,
    cookie: {
      maxAge: 7776000000,
      sameSite: true,
      secure: process.env.NODE_ENV === "development" ? false : true,
    },
  })
);

const passport = require("passport");
const GoogleStrategy = require("passport-google-oauth20").Strategy;

console.log(process.env.NODE_ENV);

// passport.serializeUser((user, cb) => {
//   console.log(user);
//   cb(null, user);
// });

// passport.deserializeUser((user, cb) => {
//   console.log(user);
//   cb(null, user);
// });

passport.use(
  new GoogleStrategy(
    {
      clientID: process.env.googleclient,
      clientSecret: process.env.googlesecret,
      callbackURL: "/auth/google/callback",
    },
    (accessToken, refreshToken, profile, cb) => {
      return cb(null, profile);
    }
  )
);

const findOrCreateUser = async (req) => {
  const user = await User.findOrCreate({
    where: { oauthToken: req.user.id },
    defaults: { username: `arks#${makeid(8)}` },
  }).catch(Sequelize.UniqueConstraintError, () => {
    findOrCreateUser(req);
  });
  // console.log(user);
  return user;
};

// User.findAll().then((res) => console.log(res));

app.use(passport.initialize());

app.get(
  "/auth/google",
  passport.authenticate("google", {
    scope: ["openid"],
    session: false,
  })
);
app.get(
  "/auth/google/callback",
  passport.authenticate("google", { session: false }),
  (req, res) => {
    findOrCreateUser(req).then((data) => {
      req.session.userId = data[0].id;
      // req.session.save();
      // console.log(req.sessionID);
      res.redirect(HOME);
    });
  }
);

app.get("/session", async (req, res) => {
  const userId = req.session.userId;
  if (userId) {
    const user = await User.findOne({
      where: { id: userId },
    }).catch((err) => console.log(err));
    if (user) {
      jwt.sign(
        {
          user: {
            id: user.id,
            username: user.username,
            isActive: user.isActive,
            isStaff: user.isStaff,
          },
        },
        process.env.jwtsecret,
        { expiresIn: "12h" },
        (err, token) => {
          if (err) {
            res.sendStatus(500);
          } else {
            res.json(token);
          }
        }
      );
      // console.log(user);
    }
  } else {
    res.sendStatus(204);
  }
});

app.post("/logout", (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      console.log(err);
    } else {
      res.clearCookie("connect.sid");
      res.sendStatus(200);
    }
  });
});

app.post("/saveguide", verifyToken, (req, res) => {
  // console.log({ authorId: req.tokenData.user.id, ...req.body });
  // console.log(req.tokenData, req.body);
  Guide.create({ userId: req.tokenData.user.id, ...req.body })
    .then((data) => {
      res.json({ id: data.dataValues.id, title: data.dataValues.title });
    })
    .catch((err) => console.log(err));
  // User.addGuide
});

app.get("/getguide", async (req, res) => {
  console.log(req.query.id);
  const data = await Guide.findOne({
    where: { id: req.query.id },
    attributes: { include: [[Sequelize.col("username"), "username"]] },
    include: [{ model: User, attributes: [] }],
  }).catch((err) => res.sendStatus(500));
  if (!data) res.sendStatus(204);
  res.json(data);
});

app.get("/getguides", async (req, res) => {
  // console.log(req.query);
  let { main, sub, lvl, na } = req.query;
  main = parseInt(main);
  sub = parseInt(sub);
  lvl = parseInt(lvl);
  na = parseInt(na);
  // console.log(typeof main);
  let search = {
    attributes: {
      exclude: [
        "markdown",
        "skills",
        "mainCOSP",
        "subCOSP",
        "mag",
        "classBoosts",
        "race",
        "gender",
        "createdAt",
      ],
      include: [[Sequelize.col("username"), "username"]],
      //   [
      //   "id",
      //   "title",
      //   "description",
      //   "main",
      //   "sub",
      //   "mainVersion",
      //   "subVersion",
      //   "mainLvl",
      //   "subLvl",
      //   "likeSum",
      //   "createdAt",
      //   "updatedAt",
      //   "userId",
      //   // { model: User, attributes: ["username"], as: "username" },
      // ]
    },
    include: [{ model: User }],
    include: [{ model: User, attributes: [] }],
    where: {},
  };
  if (na) {
    if (main !== -1) {
      search.where.main = main;
    } else {
      search.where.main = { [Op.lt]: 9 };
    }
    if (sub !== -1) {
      search.where.sub = sub;
    } else {
      search.where.sub = { [Op.lt]: 9 };
    }
    search.where.mainLvl = { [Op.lte]: lvl };
    search.where.subLvl = { [Op.lte]: lvl };
  } else {
    if (main !== -1) {
      search.where.main = main;
    }
    if (sub !== -1) {
      search.where.sub = sub;
    }
    if (lvl < 95) {
      search.where.mainLvl = { [Op.lte]: lvl };
      search.where.subLvl = { [Op.lte]: lvl };
    }
  }
  // console.log(search);
  const data = await Guide.findAll(search);
  res.json(data);
});

function verifyToken(req, res, next) {
  const authHeader = req.headers.authorization.split(" ")[1];
  jwt.verify(authHeader, process.env.jwtsecret, (err, verified) => {
    if (err) {
      console.log(err);
      req.sendStatus(401);
    } else {
      req.tokenData = verified;
      next();
    }
  });
}

const port = process.env.port || 5000;

app.listen(port, () => {
  console.log(`listening on ${port}`);
});
