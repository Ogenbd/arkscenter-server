require("dotenv").config();
// const app = require("express")();
const express = require("express");
const app = express();
const session = require("express-session");
const jwt = require("jsonwebtoken");
const Sequelize = require("sequelize");
const SequelizeStore = require("connect-session-sequelize")(session.Store);

if (process.env.NODE_ENV === "development") {
  const cors = require("cors");
  app.use(cors());
  app.use((req, res, next) => {
    res.header("Access-Control-Allow-Origin", "http://localhost:3000");
    res.header("Access-Control-Allow-Credentials", "true");
    next();
  });
}

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
});

const Guide = db.define("guide", {
  authorId: {
    type: Sequelize.INTEGER,
    references: {
      model: User,
      key: "id",
    },
    allowNull: false,
  },
  title: {
    type: Sequelize.STRING(192),
    allowNull: false,
  },
  markdown: {
    type: Sequelize.TEXT,
  },
  skills: {
    type: Sequelize.JSONB,
    allowNull: false,
  },
  mainClass: {
    type: Sequelize.SMALLINT,
    allowNull: false,
  },
  subClass: {
    type: Sequelize.SMALLINT,
    allowNull: false,
  },
  mainLvl: {
    type: Sequelize.SMALLINT,
    allowNull: false,
  },
  subLvl: {
    type: Sequelize.SMALLINT,
  },
  likeSum: {
    type: Sequelize.INTEGER,
    allowNull: false,
    defaultValue: 0,
  },
});

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

// sessionStore.sync();
// db.sync();

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

const port = process.env.port || 5000;

app.listen(port, () => {
  console.log(`listening on ${port}`);
});
