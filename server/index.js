
import 'dotenv/config';
import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import bodyParser from 'body-parser';
import { Property, User, Agent, Lead, BlogPost } from './models.js';

const app = express();
const PORT = process.env.PORT || 5000;
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/luxeestate';

// Middleware
app.use(cors());
app.use(bodyParser.json({ limit: '10mb' })); // Increased limit for Base64 images

// Database Connection
console.log('Attempting to connect to MongoDB...');
mongoose.connect(MONGODB_URI)
  .then(() => {
      console.log('Connected to MongoDB successfully');

      try {
          const isAtlas = MONGODB_URI.includes('mongodb+srv://');
          if (isAtlas) {
              const cluster = MONGODB_URI.split('@')[1].split('/')[0];
              console.log(`Connected to: MongoDB Atlas Cluster (${cluster})`);
          } else {
              console.log('Connected to: Local MongoDB (mongodb://localhost:27017)');
          }
      } catch (e) {
          console.log("Connected, but could not parse DB URL");
      }
  })

  .catch(err => {
      console.error('MongoDB connection error:', err);
      console.log('Server will start, but database features will fail.');
  });

// Routes

// Health Check
app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

// --- PROPERTIES ---
app.get('/api/properties', async (req, res) => {
  try {
    const { minPrice, maxPrice, search, status, agentId, sortBy } = req.query;
    let query = {};

    if (agentId) query.agentId = agentId;
    if (status) query.status = status;
    if (minPrice || maxPrice) {
      query.price = {};
      if (minPrice) query.price.$gte = Number(minPrice);
      if (maxPrice) query.price.$lte = Number(maxPrice);
    }

    if (search) {
      const regex = new RegExp(search, 'i');
      query.$or = [
        { title: regex },
        { 'location.city': regex },
        { type: regex }
      ];
    }

    let sortOptions = { createdAt: -1 }; // Default Newest
    if (sortBy === 'price_asc') sortOptions = { price: 1 };
    if (sortBy === 'price_desc') sortOptions = { price: -1 };

    const properties = await Property.find(query).sort(sortOptions);
    res.json(properties);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/properties/:slug', async (req, res) => {
  try {
    const property = await Property.findOne({ slug: req.params.slug });
    res.json(property);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/properties', async (req, res) => {
  try {
    const property = new Property(req.body);
    await property.save();
    res.status(201).json(property);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.put('/api/properties/:id', async (req, res) => {
  try {
    const property = await Property.findOneAndUpdate({ id: req.params.id }, req.body, { new: true });
    res.json(property);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.delete('/api/properties/:id', async (req, res) => {
  try {
    await Property.findOneAndDelete({ id: req.params.id });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- AGENTS ---
app.get('/api/agents', async (req, res) => {
  try {
    const { includeInactive } = req.query;
    let query = {};
    if (includeInactive !== 'true') {
        query.status = { $in: ['ACTIVE', 'ON_LEAVE'] };
    }
    const agents = await Agent.find(query);
    res.json(agents);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/agents', async (req, res) => {
  try {
    // In a real app, we might also create a corresponding User entity for login
    const agent = new Agent(req.body);
    await agent.save();
    res.status(201).json(agent);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.put('/api/agents/:id', async (req, res) => {
    try {
        // Update any field provided in body
        const agent = await Agent.findOneAndUpdate({ id: req.params.id }, req.body, { new: true });
        res.json(agent);
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

app.delete('/api/agents/:id', async (req, res) => {
    try {
        const agentId = req.params.id;
        
        // Check if agent has active properties
        const propertyCount = await Property.countDocuments({ agentId: agentId });
        
        if (propertyCount > 0) {
            return res.status(400).json({ 
                error: `Cannot delete agent. They have ${propertyCount} active listings. Reassign listings first.` 
            });
        }

        await Agent.findOneAndDelete({ id: agentId });
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/agents/reassign', async (req, res) => {
    try {
        const { oldAgentId, newAgentId } = req.body;
        await Property.updateMany({ agentId: oldAgentId }, { agentId: newAgentId });
        // Update listing counts (simple increment logic for demo, real app would recount)
        await Agent.findOneAndUpdate({ id: oldAgentId }, { listingsCount: 0 });
        const count = await Property.countDocuments({ agentId: newAgentId });
        await Agent.findOneAndUpdate({ id: newAgentId }, { listingsCount: count });
        
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// --- LEADS ---
app.get('/api/leads', async (req, res) => {
  try {
    // In a real app, we would verify the user token here to filter by agent
    // For this mock-backend, we return all and let frontend filter or basic query params
    const leads = await Lead.find().sort({ createdAt: -1 });
    res.json(leads);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/leads', async (req, res) => {
  try {
    const lead = new Lead(req.body);
    await lead.save();
    res.status(201).json(lead);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.put('/api/leads/:id', async (req, res) => {
    try {
        // Allow updating status OR assignedAgentId
        const updates = {};
        if (req.body.status) updates.status = req.body.status;
        if (req.body.assignedAgentId) updates.assignedAgentId = req.body.assignedAgentId;
        
        const lead = await Lead.findOneAndUpdate({ id: req.params.id }, updates, { new: true });
        res.json(lead);
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

// --- BLOG ---
app.get('/api/blog', async (req, res) => {
    try {
        const { authorId } = req.query;
        let query = {};
        if (authorId) query.authorId = authorId;
        const posts = await BlogPost.find(query).sort({ createdAt: -1 });
        res.json(posts);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/blog/:slug', async (req, res) => {
    try {
        const post = await BlogPost.findOne({ slug: req.params.slug });
        res.json(post);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/blog', async (req, res) => {
    try {
        const post = new BlogPost(req.body);
        await post.save();
        res.status(201).json(post);
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

app.put('/api/blog/:id', async (req, res) => {
    try {
        const post = await BlogPost.findOneAndUpdate({ id: req.params.id }, req.body, { new: true });
        res.json(post);
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

app.delete('/api/blog/:id', async (req, res) => {
    try {
        await BlogPost.findOneAndDelete({ id: req.params.id });
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// --- USERS ---
app.get('/api/users', async (req, res) => {
    try {
        const users = await User.find();
        res.json(users);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/users/:id/toggle-block', async (req, res) => {
    try {
        const user = await User.findOne({ id: req.params.id });
        if (!user) return res.status(404).json({ error: "User not found" });
        
        if (user.name.includes('(BLOCKED)')) {
            user.name = user.name.replace(' (BLOCKED)', '');
        } else {
            user.name = user.name + ' (BLOCKED)';
        }
        await user.save();
        res.json(user);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// --- DASHBOARD ---
app.get('/api/dashboard', async (req, res) => {
    try {
        const totalProperties = await Property.countDocuments();
        const activeLeads = await Lead.countDocuments({ status: 'NEW' });
        const totalAgents = await Agent.countDocuments({ status: 'ACTIVE' });
        const totalUsers = await User.countDocuments();
        
        res.json({ totalProperties, activeLeads, totalAgents, totalUsers });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});


// REMOVE app.listen()
// REMOVE serverless wrapper
// JUST EXPORT the express app

export default app;

