import 'dotenv/config';
import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import bodyParser from 'body-parser';
import { Property, User, Agent, Lead, BlogPost } from './models.js';

const app = express();
const PORT = process.env.PORT || 5000;

// Allow CORS
// In Vercel, the 'origin' should ideally match your Frontend URL
app.use(cors({
    origin: process.env.FRONTEND_URL || '*', 
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS']
}));

app.use(bodyParser.json({ limit: '10mb' }));

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/luxeestate';

// --- MongoDB Connection Caching for Serverless ---
// Vercel serverless functions are stateless, so we cache the connection
// to reuse it across hot invocations.
let cached = global.mongoose;
if (!cached) {
  cached = global.mongoose = { conn: null, promise: null };
}

async function connectDB() {
  if (cached.conn) {
    return cached.conn;
  }

  if (!cached.promise) {
    const opts = {
      bufferCommands: false,
    };
    cached.promise = mongoose.connect(MONGODB_URI, opts).then((mongoose) => {
      console.log('New MongoDB connection established');
      return mongoose;
    });
  }
  
  try {
    cached.conn = await cached.promise;
  } catch (e) {
    cached.promise = null;
    throw e;
  }
  return cached.conn;
}

// Middleware to ensure DB is connected before handling requests
app.use(async (req, res, next) => {
    // Skip DB connection for simple health check or root path if already connected
    if ((req.path === '/api/health' || req.path === '/') && cached.conn) {
        return next();
    }
    
    try {
        await connectDB();
        next();
    } catch (error) {
        console.error("Database Connection Failed:", error);
        res.status(500).json({ error: "Internal Database Error" });
    }
});

// --- ROUTES ---

// Root route for easy verification
app.get('/', (req, res) => {
    res.send("LuxeEstate Backend is Running 🚀");
});

// Health Check
app.get('/api/health', (req, res) => res.json({ status: 'ok', env: process.env.NODE_ENV }));

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
    const agent = new Agent(req.body);
    await agent.save();
    res.status(201).json(agent);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.put('/api/agents/:id', async (req, res) => {
    try {
        const agent = await Agent.findOneAndUpdate({ id: req.params.id }, req.body, { new: true });
        res.json(agent);
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

app.delete('/api/agents/:id', async (req, res) => {
    try {
        const agentId = req.params.id;
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

// Essential for Vercel: Export the app
export default app;

// Only listen if running locally
if (process.env.NODE_ENV !== 'production' && process.env.VERCEL !== '1') {
    app.listen(PORT, () => {
        console.log(`Development Server running on http://localhost:${PORT}`);
    });
}
