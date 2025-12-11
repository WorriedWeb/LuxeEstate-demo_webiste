import { MOCK_PROPERTIES, MOCK_AGENTS, MOCK_LEADS, MOCK_USERS, MOCK_BLOG_POSTS } from '../constants';
import { Property, Lead, Agent, User, PropertyStatus, AgentStatus, UserRole, BlogPost } from '../types';
import config from '../config';

const API_URL = config.API_BASE_URL;

// Simple delay helper to simulate network latency
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const STORAGE_KEYS = {
  PROPERTIES: 'luxe_properties',
  LEADS: 'luxe_leads',
  AGENTS: 'luxe_agents',
  USERS: 'luxe_users',
  BLOG: 'luxe_blog'
};

class MockService {
  private properties: Property[] = [];
  private leads: Lead[] = [];
  private agents: Agent[] = [];
  private users: User[] = [];
  private blogPosts: BlogPost[] = [];
  private useApi = false;

  constructor() {
    this.init();
  }

  private async init() {
    // 1. Check if Backend is available
    if (API_URL) {
      try {
          const res = await fetch(`${API_URL}/health`, { method: 'GET', signal: AbortSignal.timeout(2000) });
          if (res.ok) {
              console.log(`Connected to Backend API at: ${API_URL}`);
              this.useApi = true;
              return;
          }
      } catch (e) {
          console.warn(`Backend unreachable at ${API_URL}. Falling back to LocalStorage mock mode.`);
          this.useApi = false;
      }
    } else {
      console.log("No API_URL configured. Using LocalStorage mock mode.");
      this.useApi = false;
    }

    // 2. Initialize Local Storage if API is not used
    try {
        const storedProps = localStorage.getItem(STORAGE_KEYS.PROPERTIES);
        if (storedProps) {
            this.properties = JSON.parse(storedProps);
        } else {
            this.properties = MOCK_PROPERTIES.map(p => ({
                ...p,
                location: {
                    ...p.location,
                    country: (p.location as any).country || 'India'
                }
            }));
        }

        const storedLeads = localStorage.getItem(STORAGE_KEYS.LEADS);
        this.leads = storedLeads ? JSON.parse(storedLeads) : [...MOCK_LEADS];

        const storedAgents = localStorage.getItem(STORAGE_KEYS.AGENTS);
        this.agents = storedAgents ? JSON.parse(storedAgents) : [...MOCK_AGENTS];

        const storedUsers = localStorage.getItem(STORAGE_KEYS.USERS);
        this.users = storedUsers ? JSON.parse(storedUsers) : [...MOCK_USERS];
        
        const storedBlog = localStorage.getItem(STORAGE_KEYS.BLOG);
        this.blogPosts = storedBlog ? JSON.parse(storedBlog) : [...MOCK_BLOG_POSTS];

    } catch (e) {
        console.error("Initialization error (likely quota):", e);
        // Fallback to mocks in memory if storage is broken
        this.properties = [...MOCK_PROPERTIES];
        this.leads = [...MOCK_LEADS];
        this.agents = [...MOCK_AGENTS];
        this.users = [...MOCK_USERS];
        this.blogPosts = [...MOCK_BLOG_POSTS];
    }
  }

  private save(key: string, data: any) {
    if (this.useApi) return; 
    try {
        localStorage.setItem(key, JSON.stringify(data));
    } catch (e: any) {
        if (e.name === 'QuotaExceededError' || e.code === 22) {
             throw new Error("Storage Limit Exceeded! The browser's LocalStorage is full. Please delete some items or use Cloudinary for images.");
        }
        console.error("Save failed:", e);
        throw e;
    }
  }

  // --- IMAGE UPLOAD SERVICE ---
  async uploadImage(file: File): Promise<string> {
      // Cloudinary configuration from centralized config
      const { CLOUD_NAME, UPLOAD_PRESET } = config.CLOUDINARY;

      if (CLOUD_NAME && UPLOAD_PRESET && !CLOUD_NAME.includes('your_cloud_name')) {
          try {
              const formData = new FormData();
              formData.append('file', file);
              formData.append('upload_preset', UPLOAD_PRESET);
              
              const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`, {
                  method: 'POST',
                  body: formData
              });
              
              if (!res.ok) throw new Error('Cloudinary Upload Failed');
              
              const data = await res.json();
              return data.secure_url;
          } catch (error) {
              console.warn("Cloudinary upload failed, falling back to local compression.", error);
          }
      } else {
          console.warn("Cloudinary credentials missing or default in .env. Using local fallback.");
      }

      // Fallback: Local Canvas Compression (to Base64)
      return new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = (event) => {
              const img = new Image();
              img.onload = () => {
                  const canvas = document.createElement('canvas');
                  const MAX_WIDTH = 800; // Resize to max 800px width
                  const scaleSize = MAX_WIDTH / img.width;
                  
                  if (scaleSize < 1) {
                      canvas.width = MAX_WIDTH;
                      canvas.height = img.height * scaleSize;
                  } else {
                      canvas.width = img.width;
                      canvas.height = img.height;
                  }

                  const ctx = canvas.getContext('2d');
                  ctx?.drawImage(img, 0, 0, canvas.width, canvas.height);
                  
                  // Compress to JPEG with 0.6 quality
                  resolve(canvas.toDataURL('image/jpeg', 0.6));
              };
              img.onerror = reject;
              img.src = event.target?.result as string;
          };
          reader.onerror = reject;
          reader.readAsDataURL(file);
      });
  }

  // --- PROPERTIES ---
  async getProperties(filters?: any): Promise<Property[]> {
    if (this.useApi) {
        const params = new URLSearchParams();
        if (filters) {
            Object.keys(filters).forEach(key => {
                if (filters[key] !== undefined && filters[key] !== '') {
                    params.append(key, String(filters[key]));
                }
            });
        }
        const res = await fetch(`${API_URL}/properties?${params.toString()}`);
        return res.json();
    }

    // Local Logic
    this.init(); 
    await delay(300);

    let filtered = [...this.properties];
    
    if (filters) {
        if (filters.agentId) {
            filtered = filtered.filter(p => p.agentId === filters.agentId);
        }
        
        if (filters.status) {
            filtered = filtered.filter(p => p.status === filters.status);
        } else if (!filters.agentId && !filters.ignoreStatus) { 
            filtered = filtered.filter(p => p.status !== PropertyStatus.SOLD); 
        }
        
        if (filters.minPrice) {
            filtered = filtered.filter(p => p.price >= filters.minPrice);
        }
        if (filters.maxPrice) {
            filtered = filtered.filter(p => p.price <= filters.maxPrice);
        }
        if (filters.search) {
             const lower = filters.search.toLowerCase();
             filtered = filtered.filter(p => 
                p.title.toLowerCase().includes(lower) || 
                p.location.city.toLowerCase().includes(lower) ||
                p.type.toLowerCase().includes(lower)
             );
        }
    }

    // Sorting Logic
    if (filters?.sortBy === 'price_asc') {
        return filtered.sort((a, b) => a.price - b.price);
    } else if (filters?.sortBy === 'price_desc') {
        return filtered.sort((a, b) => b.price - a.price);
    } else {
        // Default: Newest
        return filtered.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    }
  }

  async getPropertyBySlug(slug: string): Promise<Property | undefined> {
    if (this.useApi) {
        const res = await fetch(`${API_URL}/properties/${slug}`);
        const data = await res.json();
        return data || undefined;
    }
    this.init();
    await delay(200);
    return this.properties.find((p) => p.slug === slug);
  }

  async createProperty(property: Omit<Property, 'id' | 'createdAt' | 'slug'>): Promise<Property> {
    const tempId = Math.random().toString(36).substr(2, 9);
    const slug = property.title.toLowerCase().replace(/[^a-z0-9]+/g, '-') + '-' + Math.floor(Math.random() * 1000);
    
    const newProperty = {
      ...property,
      id: tempId,
      slug: slug,
      createdAt: new Date().toISOString()
    };

    if (this.useApi) {
        const res = await fetch(`${API_URL}/properties`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(newProperty)
        });
        if (!res.ok) throw new Error('API Error');
        return res.json();
    }

    this.init();
    await delay(600);
    this.properties.unshift(newProperty as Property);
    try {
        this.save(STORAGE_KEYS.PROPERTIES, this.properties);
        return newProperty as Property;
    } catch (e) {
        this.properties.shift();
        throw e;
    }
  }

  async updateProperty(id: string, updates: Partial<Property>): Promise<Property> {
    if (this.useApi) {
        const res = await fetch(`${API_URL}/properties/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(updates)
        });
        return res.json();
    }

    this.init();
    await delay(400);

    const index = this.properties.findIndex(p => p.id === id);
    if (index === -1) throw new Error('Property not found');
    
    const oldProperty = this.properties[index];
    let newSlug = oldProperty.slug;
    if (updates.title && updates.title !== oldProperty.title) {
         newSlug = updates.title.toLowerCase().replace(/[^a-z0-9]+/g, '-') + '-' + Math.floor(Math.random() * 1000);
    }

    this.properties[index] = { 
        ...oldProperty, 
        ...updates,
        slug: newSlug
    };
    
    try {
        this.save(STORAGE_KEYS.PROPERTIES, this.properties);
        return this.properties[index];
    } catch (e) {
        this.properties[index] = oldProperty;
        throw e;
    }
  }

  async deleteProperty(id: string): Promise<boolean> {
    if (this.useApi) {
        await fetch(`${API_URL}/properties/${id}`, { method: 'DELETE' });
        return true;
    }

    this.init();
    await delay(300);
    const original = [...this.properties];
    this.properties = this.properties.filter(p => p.id !== id);
    try {
        this.save(STORAGE_KEYS.PROPERTIES, this.properties);
        return true;
    } catch(e) {
        this.properties = original;
        throw e;
    }
  }

  // --- LEADS ---
  async createLead(lead: Omit<Lead, 'id' | 'createdAt' | 'status'>): Promise<Lead> {
    const newLead = {
      ...lead,
      id: Math.random().toString(36).substr(2, 9),
      status: 'NEW',
      createdAt: new Date().toISOString()
    };

    if (this.useApi) {
        const res = await fetch(`${API_URL}/leads`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(newLead)
        });
        return res.json();
    }

    this.init();
    await delay(400);
    this.leads.unshift(newLead as Lead);
    this.save(STORAGE_KEYS.LEADS, this.leads);
    return newLead as Lead;
  }

  async getLeads(currentUser?: User): Promise<Lead[]> {
    if (this.useApi) {
        const res = await fetch(`${API_URL}/leads`);
        let allLeads = await res.json();
        
        // Filter Logic
        if (currentUser) {
            if (currentUser.role === UserRole.AGENT) {
                const propsRes = await fetch(`${API_URL}/properties?agentId=${currentUser.id}`);
                const myProps: Property[] = await propsRes.json();
                const myPropIds = myProps.map(p => p.id);
                
                allLeads = allLeads.filter((l: Lead) => 
                    (l.propertyId && myPropIds.includes(l.propertyId)) || 
                    l.assignedAgentId === currentUser.id
                );
            }
        }
        return allLeads;
    }

    // Local Logic
    this.init();
    await delay(300);
    
    let filteredLeads = [...this.leads];

    if (currentUser) {
        if (currentUser.role === UserRole.AGENT) {
            const myPropertyIds = this.properties
                .filter(p => p.agentId === currentUser.id)
                .map(p => p.id);
            
            filteredLeads = filteredLeads.filter(l => 
                (l.propertyId && myPropertyIds.includes(l.propertyId)) ||
                l.assignedAgentId === currentUser.id
            );
        }
    }

    return filteredLeads.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  async updateLeadStatus(id: string, status: Lead['status']): Promise<Lead> {
    if (this.useApi) {
        const res = await fetch(`${API_URL}/leads/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status })
        });
        return res.json();
    }

    this.init();
    await delay(300);
    const index = this.leads.findIndex(l => l.id === id);
    if (index === -1) throw new Error('Lead not found');
    this.leads[index].status = status;
    this.save(STORAGE_KEYS.LEADS, this.leads);
    return this.leads[index];
  }

  async assignLead(leadId: string, agentId: string): Promise<Lead> {
      if (this.useApi) {
          const res = await fetch(`${API_URL}/leads/${leadId}`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ assignedAgentId: agentId })
          });
          return res.json();
      }

      this.init();
      await delay(300);
      const index = this.leads.findIndex(l => l.id === leadId);
      if (index === -1) throw new Error('Lead not found');
      
      this.leads[index].assignedAgentId = agentId;
      this.save(STORAGE_KEYS.LEADS, this.leads);
      return this.leads[index];
  }

  // --- AGENTS ---
  async getAgents(includeInactive = false): Promise<Agent[]> {
      if (this.useApi) {
          const res = await fetch(`${API_URL}/agents?includeInactive=${includeInactive}`);
          return res.json();
      }

      this.init();
      await delay(300);
      if (includeInactive) return this.agents;
      return this.agents.filter(a => a.status === AgentStatus.ACTIVE || a.status === AgentStatus.ON_LEAVE);
  }

  async createAgent(agentData: Partial<Agent>): Promise<Agent> {
      const newAgent = {
          ...agentData,
          id: Math.random().toString(36).substr(2, 9),
          role: UserRole.AGENT,
          listingsCount: 0,
          status: AgentStatus.ACTIVE
      };

      if (this.useApi) {
          const res = await fetch(`${API_URL}/agents`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(newAgent)
          });
          return res.json();
      }

      this.init();
      await delay(500);
      this.agents.push(newAgent as Agent);
      
      try {
          this.save(STORAGE_KEYS.AGENTS, this.agents);
          return newAgent as Agent;
      } catch (e) {
          this.agents.pop();
          throw e;
      }
  }

  async updateAgentStatus(id: string, status: AgentStatus): Promise<Agent> {
      return this.updateAgent(id, { status });
  }

  async updateAgent(id: string, updates: Partial<Agent>): Promise<Agent> {
      if (this.useApi) {
          const res = await fetch(`${API_URL}/agents/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(updates)
          });
          return res.json();
      }

      this.init();
      await delay(300);
      const index = this.agents.findIndex(a => a.id === id);
      if (index === -1) throw new Error('Agent not found');
      
      this.agents[index] = { ...this.agents[index], ...updates };
      this.save(STORAGE_KEYS.AGENTS, this.agents);
      return this.agents[index];
  }

  async deleteAgent(id: string): Promise<boolean> {
      if (this.useApi) {
          const res = await fetch(`${API_URL}/agents/${id}`, { method: 'DELETE' });
          if (!res.ok) {
              const err = await res.json();
              throw new Error(err.error || 'Failed to delete agent');
          }
          return true;
      }

      this.init();
      await delay(400);

      const hasListings = this.properties.some(p => p.agentId === id);
      if (hasListings) {
          const count = this.properties.filter(p => p.agentId === id).length;
          throw new Error(`Cannot delete agent. They have ${count} active listings. Reassign listings first.`);
      }

      const original = [...this.agents];
      this.agents = this.agents.filter(a => a.id !== id);
      
      try {
          this.save(STORAGE_KEYS.AGENTS, this.agents);
          return true;
      } catch (e) {
          this.agents = original;
          throw e;
      }
  }

  async reassignListings(oldAgentId: string, newAgentId: string): Promise<void> {
      if (this.useApi) {
          await fetch(`${API_URL}/agents/reassign`, {
             method: 'POST',
             headers: { 'Content-Type': 'application/json' },
             body: JSON.stringify({ oldAgentId, newAgentId })
          });
          return;
      }

      this.init();
      await delay(500);

      let count = 0;
      this.properties = this.properties.map(p => {
          if (p.agentId === oldAgentId) {
              count++;
              return { ...p, agentId: newAgentId };
          }
          return p;
      });
      
      if (count > 0) {
          this.save(STORAGE_KEYS.PROPERTIES, this.properties);
          // Recalculate counts locally
          const oldAgentIdx = this.agents.findIndex(a => a.id === oldAgentId);
          const newAgentIdx = this.agents.findIndex(a => a.id === newAgentId);
          
          if (oldAgentIdx > -1) this.agents[oldAgentIdx].listingsCount = 0;
          if (newAgentIdx > -1) {
               this.agents[newAgentIdx].listingsCount = this.properties.filter(p => p.agentId === newAgentId).length;
          }
          this.save(STORAGE_KEYS.AGENTS, this.agents);
      }
  }

  // --- USERS ---
  async getUsers(): Promise<User[]> {
      if (this.useApi) {
          const res = await fetch(`${API_URL}/users`);
          return res.json();
      }
      this.init();
      await delay(300);
      return this.users;
  }

  async toggleUserBlock(id: string): Promise<User> {
      if (this.useApi) {
          const res = await fetch(`${API_URL}/users/${id}/toggle-block`, { method: 'PUT' });
          return res.json();
      }

      this.init();
      await delay(300);
      const index = this.users.findIndex(u => u.id === id);
      if (index > -1) {
          const user = this.users[index];
          if (user.name.includes('(BLOCKED)')) {
              user.name = user.name.replace(' (BLOCKED)', '');
          } else {
              user.name = user.name + ' (BLOCKED)';
          }
          this.users[index] = user;
          this.save(STORAGE_KEYS.USERS, this.users);
          return user;
      }
      throw new Error("User not found");
  }

  // --- BLOG ---
  async getBlogPosts(authorId?: string): Promise<BlogPost[]> {
      if (this.useApi) {
          let url = `${API_URL}/blog`;
          if (authorId) url += `?authorId=${authorId}`;
          const res = await fetch(url);
          return res.json();
      }

      this.init();
      await delay(300);
      
      if (authorId) {
          return this.blogPosts.filter(p => p.authorId === authorId);
      }
      return this.blogPosts.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  async getBlogPostBySlug(slug: string): Promise<BlogPost | undefined> {
      if (this.useApi) {
          const res = await fetch(`${API_URL}/blog/${slug}`);
          const data = await res.json();
          return data || undefined;
      }

      this.init();
      return this.blogPosts.find(p => p.slug === slug);
  }

  async createBlogPost(post: Omit<BlogPost, 'id' | 'createdAt' | 'slug'>): Promise<BlogPost> {
      const slug = post.title.toLowerCase().replace(/[^a-z0-9]+/g, '-') + '-' + Math.floor(Math.random() * 1000);
      const newPost = {
          ...post,
          id: Math.random().toString(36).substr(2, 9),
          createdAt: new Date().toISOString(),
          slug: slug
      };
      
      if (this.useApi) {
          const res = await fetch(`${API_URL}/blog`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(newPost)
          });
          return res.json();
      }

      this.init();
      await delay(500);
      this.blogPosts.unshift(newPost as BlogPost);
      
      try {
          this.save(STORAGE_KEYS.BLOG, this.blogPosts);
          return newPost as BlogPost;
      } catch (e) {
          this.blogPosts.shift();
          throw e;
      }
  }

  async updateBlogPost(id: string, updates: Partial<BlogPost>): Promise<BlogPost> {
      if (this.useApi) {
          const res = await fetch(`${API_URL}/blog/${id}`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(updates)
          });
          return res.json();
      }

      this.init();
      await delay(300);
      const index = this.blogPosts.findIndex(p => p.id === id);
      if (index === -1) throw new Error('Post not found');
      
      const oldPost = this.blogPosts[index];
      let newSlug = oldPost.slug;
      if (updates.title && updates.title !== oldPost.title) {
           newSlug = updates.title.toLowerCase().replace(/[^a-z0-9]+/g, '-') + '-' + Math.floor(Math.random() * 1000);
      }
      
      this.blogPosts[index] = { ...oldPost, ...updates, slug: newSlug };
      
      try {
          this.save(STORAGE_KEYS.BLOG, this.blogPosts);
          return this.blogPosts[index];
      } catch (e) {
          this.blogPosts[index] = oldPost;
          throw e;
      }
  }

  async deleteBlogPost(id: string): Promise<void> {
      if (this.useApi) {
          await fetch(`${API_URL}/blog/${id}`, { method: 'DELETE' });
          return;
      }

      this.init();
      await delay(300);
      const original = [...this.blogPosts];
      this.blogPosts = this.blogPosts.filter(p => p.id !== id);
      try {
          this.save(STORAGE_KEYS.BLOG, this.blogPosts);
      } catch (e) {
          this.blogPosts = original;
          throw e;
      }
  }

  // --- ANALYTICS ---
  async getDashboardStats() {
    if (this.useApi) {
        const res = await fetch(`${API_URL}/dashboard`);
        return res.json();
    }

    this.init();
    await delay(400);

    return {
      totalProperties: this.properties.length,
      activeLeads: this.leads.filter(l => l.status === 'NEW').length,
      totalAgents: this.agents.filter(a => a.status === AgentStatus.ACTIVE).length,
      totalUsers: this.users.length
    };
  }

  // Gemini Integration (Client Side for now)
  async generatePropertyDescription(title: string, features: any): Promise<string> {
      await delay(1500);
      return `Indulge in the epitome of luxury with this magnificent residence, "${title}". Boasting ${features.bedrooms} expansive bedrooms and ${features.bathrooms} designer bathrooms, this ${features.sqft} sqft estate is a masterpiece of modern living. Constructed in ${features.yearBuilt}, every detail has been meticulously curated to offer an unparalleled lifestyle of comfort and sophistication.`;
  }
}

export const mockService = new MockService();