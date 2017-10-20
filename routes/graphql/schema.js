const {
  addResolveFunctionsToSchema,
  makeExecutableSchema,
} = require('graphql-tools');
const { PlayerResolver, PlayerSchema } = require('./models/Player');

const RootQuery = `
 type RootQuery {
    search(query:String):[Player]
 }
`;
const RootMutation = `
 type RootMutation {
    
 }
 
`;
const SchemaDefinition = `
  schema {
    query: RootQuery
  }
`;
const resolvers = {
  RootQuery: {},
};
const schema = makeExecutableSchema({
  typeDefs: [SchemaDefinition, RootQuery, PlayerSchema],
  resolvers,
});
addResolveFunctionsToSchema(schema, PlayerResolver);
module.exports = schema;
