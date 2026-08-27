const Task = require('../models/Task');
const Comment = require('../models/Comment');
const Project = require('../models/Project');
const mongoose = require('mongoose');
const { isProjectMember } = require('../middleware/roleMiddleware');

// Helper to generate intelligent fallback summary if OpenAI API key is missing or encounters an error
const generateFallbackSummary = (task, comments) => {
  const points = [];
  points.push(`• **Objective**: ${task.title}${task.description ? ' - ' + task.description : ''}`);
  points.push(`• **Current Status**: Marked as "${task.status.toUpperCase()}"${task.assignedTo ? ', assigned to ' + task.assignedTo.name : ''}.`);
  
  if (comments.length > 0) {
    points.push(`• **Discussion Activity**: ${comments.length} comment${comments.length === 1 ? '' : 's'} exchanged in discussion thread.`);
    const recent = comments[comments.length - 1];
    const author = recent.user ? recent.user.name : 'Team Member';
    points.push(`• **Latest Update**: "${recent.text}" — by ${author}.`);
  } else {
    points.push(`• **Next Steps**: Awaiting team updates and discussion comments.`);
  }

  return points.join('\n');
};

// @desc    Generate AI summary of task details and discussion comments
// @route   POST /api/tasks/:id/summary OR POST /api/ai/tasks/:id/summary
// @access  Private
const generateTaskSummary = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: 'Invalid task ID format' });
    }

    const task = await Task.findById(id)
      .populate('assignedTo', 'name email')
      .populate('project', 'name');

    if (!task) {
      return res.status(404).json({ message: 'Task not found' });
    }

    const project = await Project.findById(task.project);
    if (!project || !isProjectMember(project, req.user._id)) {
      return res.status(403).json({ message: 'Access denied. You are not a member of this project' });
    }

    // Fetch all comments for the task
    const comments = await Comment.find({ task: id })
      .populate('user', 'name email')
      .sort({ createdAt: 1 });

    const commentsText = comments.length > 0
      ? comments.map((c) => `- [${c.user ? c.user.name : 'User'}]: "${c.text}"`).join('\n')
      : 'No comments yet.';

    let summary = '';

    // Check if OpenAI API key is configured
    const apiKey = process.env.OPENAI_API_KEY;

    if (apiKey && apiKey.trim() !== '' && !apiKey.includes('your_openai_api_key')) {
      try {
        const prompt = `You are an expert AI Project Management Assistant.
Summarize the following task details and discussion thread into 3 to 5 clear, short, actionable bullet points highlighting objective, progress, key decisions, and next steps. Format output strictly as bullet points starting with '• '.

Task Title: ${task.title}
Task Description: ${task.description || 'None'}
Status: ${task.status}
Assigned To: ${task.assignedTo ? task.assignedTo.name : 'Unassigned'}

Discussion Comments:
${commentsText}`;

        const response = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
          },
          body: JSON.stringify({
            model: 'gpt-3.5-turbo',
            messages: [
              { role: 'system', content: 'You summarize project tasks concisely in 3-5 bullet points.' },
              { role: 'user', content: prompt }
            ],
            temperature: 0.5,
            max_tokens: 250
          })
        });

        const data = await response.json();

        if (response.ok && data.choices && data.choices[0] && data.choices[0].message) {
          summary = data.choices[0].message.content.trim();
        } else {
          console.warn('OpenAI API call failed or returned error, using intelligent fallback:', data);
          summary = generateFallbackSummary(task, comments);
        }
      } catch (aiErr) {
        console.error('OpenAI API fetch error, falling back:', aiErr.message);
        summary = generateFallbackSummary(task, comments);
      }
    } else {
      // Fallback summary when OpenAI API Key is not provided
      summary = generateFallbackSummary(task, comments);
    }

    // Save generated summary in database
    task.aiSummary = summary;
    await task.save();

    return res.status(200).json({
      success: true,
      message: 'AI summary generated successfully',
      summary,
      taskId: id,
      task
    });
  } catch (error) {
    console.error('Generate task summary error:', error);
    return res.status(500).json({ message: 'Server error generating AI summary', error: error.message });
  }
};

module.exports = {
  generateTaskSummary
};
