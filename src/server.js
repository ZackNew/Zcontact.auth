const express = require("express");
import fetch from 'node-fetch'
// const fetch = require("node-fetch");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const bodyParser = require("body-parser");
const app = express();

const HASURA_OPERATION = `
mutation($username: String!, $email: String, $password: String!, $phone_number: String!,){
  insert_users_one(object: {
    username: $username
    email: $email
    password: $password
    phone_number: $phone_number
  }){
    id
    username
    email
    phone_number
    created_at
  }
}
`;

const GET_USER = `
query MyQuery($username: String!) {
  users(where: {username: {_eq: $username}}){
    id
    password
  }
}`

const execute = async (query, variables) => {
  const fetchResponse = await fetch("http://localhost:8080/v1/graphql", {
    method: "POST",
    headers: {"x-hasura-admin-secret": "admin"},
    body: JSON.stringify({
      query: query,
      variables,
    }),
  });
  const data = await fetchResponse.json();
  console.log("DEBUG:", data);
  return data;
};

const PORT = process.env.PORT || 8000;

app.use(bodyParser.json());

app.post("/signup", async (req, res) => {
  const { username, email, password, phone_number } = req.body.input;

  // run some business logic
  let hashedPassword = await bcrypt.hash(password, 10);

  // execute the Hasura operation
  const { data, errors } = await execute(HASURA_OPERATION, {
    username,
    email,
    password: hashedPassword,
    phone_number,
  });

  // if Hasura operation errors, then throw error
  if (errors) {
    return res.status(400).json(errors[0]);
  }

  const tokenContents = {
    sub: data.insert_users_one.id.toString(),
    username: username,
    iat: Date.now() / 1000,
    iss: "https://myapp.com",
    "https://hasura.io/jwt/claims": {
      "x-hasura-user-id": data.insert_users_one.id.toString(),
      "x-hasura-default-role": "user",
      "x-hasura-allowed-roles": ["user"],
    },
  };

  const token = jwt.sign(tokenContents, "ZyPN7XlmiYL52XMj1fCPuqlNIjwUoVKNt");

  // success
  return res.json({
    ...data.insert_users_one,
    token: token,
  });
});

app.post('/signin', async (req, res) => {

  // get request input
  const { username, password } = req.body;
  console.log(username, password);
  // run some business logic

  const { data, errors } = await execute(GET_USER, {
    username,
  });
  if (data.users.length === 0) {
    return res.status(400).json({"message": "incorrect username or password"});
  }
  let is_valid_user = await bcrypt.compare(password, data.users[0].password);
  if (!is_valid_user) {
    return res.status(400).json({"message": "incorrect username or password"});
  }
  console.log(data.users)
  const tokenContents = {
    username: username,
    iat: Date.now() / 1000,
    iss: "https://myapp.com",
    "https://hasura.io/jwt/claims": {
      "x-hasura-user-id":`${data.users[0].id}`,
      "x-hasura-default-role": "user",
      "x-hasura-allowed-roles": ["user"],
    },
    exp: Math.floor(Date.now() / 1000) + 24 * 60 * 60,
  };

  const token = jwt.sign(tokenContents, "ZyPN7XlmiYL52XMj1fCPuqlNIjwUoVKNt");

  /*
  // In case of errors:
  return res.status(400).json({
    message: "error happened"
  })
  */

  // success
  return res.json({
    token: token
  })

});

app.listen(PORT);
