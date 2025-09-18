import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { organizationsTable, usersTable, projectsTable, tasksTable } from '../db/schema';
import { type CreateTaskInput, type UpdateTaskInput, type MoveTaskInput, type GetTasksInput } from '../schema';
import { 
  createTask, 
  getTasks, 
  getTaskById, 
  updateTask, 
  moveTask, 
  deleteTask, 
  getTasksByAssignee 
} from '../handlers/tasks';
import { eq, and } from 'drizzle-orm';

// Test data setup helpers
const createTestOrganization = async () => {
  const result = await db.insert(organizationsTable)
    .values({
      name: 'Test Organization',
      slug: 'test-org'
    })
    .returning()
    .execute();
  return result[0];
};

const createTestUser = async (organizationId: number, name: string = 'Test User', email: string = 'test@example.com') => {
  const result = await db.insert(usersTable)
    .values({
      email,
      name,
      role: 'member',
      organization_id: organizationId,
      auth_provider: 'email',
      password_hash: 'hashed_password'
    })
    .returning()
    .execute();
  return result[0];
};

const createTestProject = async (organizationId: number, createdBy: number) => {
  const result = await db.insert(projectsTable)
    .values({
      name: 'Test Project',
      description: 'A test project',
      organization_id: organizationId,
      created_by: createdBy
    })
    .returning()
    .execute();
  return result[0];
};

describe('Task Handlers', () => {
  beforeEach(createDB);
  afterEach(resetDB);

  let organization: any;
  let user1: any;
  let user2: any;
  let project: any;

  beforeEach(async () => {
    organization = await createTestOrganization();
    user1 = await createTestUser(organization.id, 'User One', 'user1@example.com');
    user2 = await createTestUser(organization.id, 'User Two', 'user2@example.com');
    project = await createTestProject(organization.id, user1.id);
  });

  describe('createTask', () => {
    const baseTaskInput: CreateTaskInput = {
      title: 'Test Task',
      description: 'A test task description',
      project_id: 0, // Will be set in tests
      assignee_id: 0, // Will be set in tests
      priority: 'medium',
      status: 'todo',
      due_date: new Date('2024-12-31'),
      created_by: 0 // Will be set in tests
    };

    it('should create a task with all fields', async () => {
      const input = {
        ...baseTaskInput,
        project_id: project.id,
        assignee_id: user2.id,
        created_by: user1.id
      };

      const result = await createTask(input);

      expect(result.title).toEqual('Test Task');
      expect(result.description).toEqual('A test task description');
      expect(result.project_id).toEqual(project.id);
      expect(result.assignee_id).toEqual(user2.id);
      expect(result.priority).toEqual('medium');
      expect(result.status).toEqual('todo');
      expect(result.due_date).toEqual(input.due_date!);
      expect(result.position).toEqual(0);
      expect(result.created_by).toEqual(user1.id);
      expect(result.id).toBeDefined();
      expect(result.created_at).toBeInstanceOf(Date);
      expect(result.updated_at).toBeInstanceOf(Date);
    });

    it('should create a task with minimal fields', async () => {
      const input: CreateTaskInput = {
        title: 'Minimal Task',
        project_id: project.id,
        priority: 'high',
        status: 'in_progress',
        created_by: user1.id
      };

      const result = await createTask(input);

      expect(result.title).toEqual('Minimal Task');
      expect(result.description).toBeNull();
      expect(result.assignee_id).toBeNull();
      expect(result.due_date).toBeNull();
      expect(result.priority).toEqual('high');
      expect(result.status).toEqual('in_progress');
      expect(result.position).toEqual(0);
    });

    it('should set correct position when multiple tasks exist in same status', async () => {
      const input1: CreateTaskInput = {
        title: 'Task 1',
        project_id: project.id,
        priority: 'medium',
        status: 'todo',
        created_by: user1.id
      };

      const input2: CreateTaskInput = {
        title: 'Task 2',
        project_id: project.id,
        priority: 'medium',
        status: 'todo',
        created_by: user1.id
      };

      const task1 = await createTask(input1);
      const task2 = await createTask(input2);

      expect(task1.position).toEqual(0);
      expect(task2.position).toEqual(1);
    });

    it('should throw error when project does not exist', async () => {
      const input: CreateTaskInput = {
        title: 'Test Task',
        project_id: 99999,
        priority: 'medium',
        status: 'todo',
        created_by: user1.id
      };

      await expect(createTask(input)).rejects.toThrow(/project not found/i);
    });

    it('should throw error when creator does not exist', async () => {
      const input: CreateTaskInput = {
        title: 'Test Task',
        project_id: project.id,
        priority: 'medium',
        status: 'todo',
        created_by: 99999
      };

      await expect(createTask(input)).rejects.toThrow(/creator user not found/i);
    });

    it('should throw error when assignee does not exist', async () => {
      const input: CreateTaskInput = {
        title: 'Test Task',
        project_id: project.id,
        assignee_id: 99999,
        priority: 'medium',
        status: 'todo',
        created_by: user1.id
      };

      await expect(createTask(input)).rejects.toThrow(/assignee user not found/i);
    });
  });

  describe('getTasks', () => {
    it('should get all tasks for a project ordered by status and position', async () => {
      // Create tasks in different statuses
      await createTask({
        title: 'Task Todo 1',
        project_id: project.id,
        priority: 'medium',
        status: 'todo',
        created_by: user1.id
      });

      await createTask({
        title: 'Task In Progress 1',
        project_id: project.id,
        priority: 'high',
        status: 'in_progress',
        created_by: user1.id
      });

      await createTask({
        title: 'Task Todo 2',
        project_id: project.id,
        priority: 'low',
        status: 'todo',
        created_by: user1.id
      });

      const input: GetTasksInput = {
        project_id: project.id
      };

      const result = await getTasks(input);

      expect(result).toHaveLength(3);
      
      // Should be ordered by status (todo comes before in_progress), then by position
      expect(result[0].title).toEqual('Task Todo 1');
      expect(result[0].status).toEqual('todo');
      expect(result[0].position).toEqual(0);
      
      expect(result[1].title).toEqual('Task Todo 2');
      expect(result[1].status).toEqual('todo');
      expect(result[1].position).toEqual(1);
      
      expect(result[2].title).toEqual('Task In Progress 1');
      expect(result[2].status).toEqual('in_progress');
      expect(result[2].position).toEqual(0);
    });

    it('should return empty array when project has no tasks', async () => {
      const input: GetTasksInput = {
        project_id: project.id
      };

      const result = await getTasks(input);
      expect(result).toHaveLength(0);
    });

    it('should throw error when project does not exist', async () => {
      const input: GetTasksInput = {
        project_id: 99999
      };

      await expect(getTasks(input)).rejects.toThrow(/project not found/i);
    });
  });

  describe('getTaskById', () => {
    it('should return task when it exists', async () => {
      const createdTask = await createTask({
        title: 'Test Task',
        project_id: project.id,
        priority: 'medium',
        status: 'todo',
        created_by: user1.id
      });

      const result = await getTaskById(createdTask.id);

      expect(result).not.toBeNull();
      expect(result!.id).toEqual(createdTask.id);
      expect(result!.title).toEqual('Test Task');
    });

    it('should return null when task does not exist', async () => {
      const result = await getTaskById(99999);
      expect(result).toBeNull();
    });
  });

  describe('updateTask', () => {
    it('should update task fields', async () => {
      const createdTask = await createTask({
        title: 'Original Task',
        description: 'Original description',
        project_id: project.id,
        assignee_id: user1.id,
        priority: 'low',
        status: 'todo',
        created_by: user1.id
      });

      const input: UpdateTaskInput = {
        id: createdTask.id,
        title: 'Updated Task',
        description: 'Updated description',
        assignee_id: user2.id,
        priority: 'high',
        status: 'in_progress',
        due_date: new Date('2024-12-25')
      };

      const result = await updateTask(input);

      expect(result.title).toEqual('Updated Task');
      expect(result.description).toEqual('Updated description');
      expect(result.assignee_id).toEqual(user2.id);
      expect(result.priority).toEqual('high');
      expect(result.status).toEqual('in_progress');
      expect(result.due_date).toEqual(input.due_date!);
      expect(result.updated_at).toBeInstanceOf(Date);
      expect(result.updated_at.getTime()).toBeGreaterThan(createdTask.updated_at.getTime());
    });

    it('should update only provided fields', async () => {
      const createdTask = await createTask({
        title: 'Original Task',
        description: 'Original description',
        project_id: project.id,
        priority: 'low',
        status: 'todo',
        created_by: user1.id
      });

      const input: UpdateTaskInput = {
        id: createdTask.id,
        title: 'Updated Title Only'
      };

      const result = await updateTask(input);

      expect(result.title).toEqual('Updated Title Only');
      expect(result.description).toEqual('Original description');
      expect(result.priority).toEqual('low');
      expect(result.status).toEqual('todo');
    });

    it('should handle null values correctly', async () => {
      const createdTask = await createTask({
        title: 'Original Task',
        description: 'Original description',
        project_id: project.id,
        assignee_id: user1.id,
        priority: 'medium',
        status: 'todo',
        created_by: user1.id
      });

      const input: UpdateTaskInput = {
        id: createdTask.id,
        description: null,
        assignee_id: null,
        due_date: null
      };

      const result = await updateTask(input);

      expect(result.description).toBeNull();
      expect(result.assignee_id).toBeNull();
      expect(result.due_date).toBeNull();
    });

    it('should throw error when task does not exist', async () => {
      const input: UpdateTaskInput = {
        id: 99999,
        title: 'Updated Task'
      };

      await expect(updateTask(input)).rejects.toThrow(/task not found/i);
    });

    it('should throw error when assignee does not exist', async () => {
      const createdTask = await createTask({
        title: 'Test Task',
        project_id: project.id,
        priority: 'medium',
        status: 'todo',
        created_by: user1.id
      });

      const input: UpdateTaskInput = {
        id: createdTask.id,
        assignee_id: 99999
      };

      await expect(updateTask(input)).rejects.toThrow(/assignee user not found/i);
    });
  });

  describe('moveTask', () => {
    it('should move task to different status', async () => {
      const task1 = await createTask({
        title: 'Task 1',
        project_id: project.id,
        priority: 'medium',
        status: 'todo',
        created_by: user1.id
      });

      const task2 = await createTask({
        title: 'Task 2',
        project_id: project.id,
        priority: 'medium',
        status: 'in_progress',
        created_by: user1.id
      });

      const input: MoveTaskInput = {
        id: task1.id,
        status: 'in_progress',
        position: 0
      };

      const result = await moveTask(input);

      expect(result.status).toEqual('in_progress');
      expect(result.position).toEqual(0);

      // Check that other task's position was updated
      const updatedTask2 = await getTaskById(task2.id);
      expect(updatedTask2!.position).toEqual(1);
    });

    it('should move task within same status column', async () => {
      // Create multiple tasks in same status
      const task1 = await createTask({
        title: 'Task 1',
        project_id: project.id,
        priority: 'medium',
        status: 'todo',
        created_by: user1.id
      });

      const task2 = await createTask({
        title: 'Task 2',
        project_id: project.id,
        priority: 'medium',
        status: 'todo',
        created_by: user1.id
      });

      const task3 = await createTask({
        title: 'Task 3',
        project_id: project.id,
        priority: 'medium',
        status: 'todo',
        created_by: user1.id
      });

      // Move task1 from position 0 to position 2
      const input: MoveTaskInput = {
        id: task1.id,
        status: 'todo',
        position: 2
      };

      const result = await moveTask(input);

      expect(result.position).toEqual(2);

      // Verify all positions are correct
      const allTasks = await getTasks({ project_id: project.id });
      const todoTasks = allTasks.filter(t => t.status === 'todo').sort((a, b) => a.position - b.position);

      expect(todoTasks[0].title).toEqual('Task 2');
      expect(todoTasks[0].position).toEqual(0);
      expect(todoTasks[1].title).toEqual('Task 3');
      expect(todoTasks[1].position).toEqual(1);
      expect(todoTasks[2].title).toEqual('Task 1');
      expect(todoTasks[2].position).toEqual(2);
    });

    it('should throw error when task does not exist', async () => {
      const input: MoveTaskInput = {
        id: 99999,
        status: 'in_progress',
        position: 0
      };

      await expect(moveTask(input)).rejects.toThrow(/task not found/i);
    });
  });

  describe('deleteTask', () => {
    it('should delete task and adjust positions', async () => {
      const task1 = await createTask({
        title: 'Task 1',
        project_id: project.id,
        priority: 'medium',
        status: 'todo',
        created_by: user1.id
      });

      const task2 = await createTask({
        title: 'Task 2',
        project_id: project.id,
        priority: 'medium',
        status: 'todo',
        created_by: user1.id
      });

      const task3 = await createTask({
        title: 'Task 3',
        project_id: project.id,
        priority: 'medium',
        status: 'todo',
        created_by: user1.id
      });

      // Delete middle task
      const result = await deleteTask(task2.id);
      expect(result).toBe(true);

      // Verify task is deleted
      const deletedTask = await getTaskById(task2.id);
      expect(deletedTask).toBeNull();

      // Verify remaining tasks have correct positions
      const remainingTask1 = await getTaskById(task1.id);
      const remainingTask3 = await getTaskById(task3.id);

      expect(remainingTask1!.position).toEqual(0);
      expect(remainingTask3!.position).toEqual(1); // Should be decremented from 2 to 1
    });

    it('should return false when task does not exist', async () => {
      const result = await deleteTask(99999);
      expect(result).toBe(false);
    });
  });

  describe('getTasksByAssignee', () => {
    it('should get all tasks assigned to user', async () => {
      // Create tasks assigned to user2
      await createTask({
        title: 'Task 1',
        project_id: project.id,
        assignee_id: user2.id,
        priority: 'high',
        status: 'todo',
        due_date: new Date('2024-12-25'),
        created_by: user1.id
      });

      await createTask({
        title: 'Task 2',
        project_id: project.id,
        assignee_id: user2.id,
        priority: 'medium',
        status: 'in_progress',
        due_date: new Date('2024-12-20'),
        created_by: user1.id
      });

      // Create task assigned to user1 (should not be included)
      await createTask({
        title: 'Task 3',
        project_id: project.id,
        assignee_id: user1.id,
        priority: 'low',
        status: 'todo',
        created_by: user1.id
      });

      const result = await getTasksByAssignee(user2.id);

      expect(result).toHaveLength(2);
      expect(result.every(task => task.assignee_id === user2.id)).toBe(true);
      
      // Should be ordered by due date (earliest first)
      expect(result[0].title).toEqual('Task 2');
      expect(result[1].title).toEqual('Task 1');
    });

    it('should return empty array when user has no assigned tasks', async () => {
      const result = await getTasksByAssignee(user2.id);
      expect(result).toHaveLength(0);
    });

    it('should throw error when assignee does not exist', async () => {
      await expect(getTasksByAssignee(99999)).rejects.toThrow(/assignee user not found/i);
    });
  });
});