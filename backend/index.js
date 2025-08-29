const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const config = require('./config');
const app = express();

app.use(cors());
app.use(express.json());

mongoose.connect(config.mongoUri, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
  .then(() => console.log('Connected to MongoDB'))
  .catch((err) => console.error('MongoDB connection error:', err));

app.get('/', (req, res) => {
  res.send('JamRoom API is running');
});

if (config.nodeEnv === 'development') {
  app.listen(config.port, () => {
    console.log(`Local server running on port ${config.port}`);
  });
} else {
  // Production server logic can be added here
  console.log('Production mode: server not started locally.');
}
