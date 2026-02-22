"use server";

import { getAdminFirestore } from "@/lib/firebaseAdmin";
import type { CodeGraph } from "./graphBuilder";

const db = getAdminFirestore();
const PROJECTS_COLLECTION = "projects";

// ──────────────────────────────────────────────
// Store Graph in Project Document
// ──────────────────────────────────────────────

export async function storeGraph(projectId: string, graph: CodeGraph): Promise<void> {
  console.log(`\n💾 [GRAPH STORE] Storing graph for project: ${projectId}`);
  console.log(`   Nodes: ${graph.nodes.length}, Edges: ${graph.edges.length}`);

  try {
    const projectRef = db.collection(PROJECTS_COLLECTION).doc(projectId);

    // Store graph as a field in the project document
    await projectRef.update({
      graph: {
        nodes: graph.nodes,
        edges: graph.edges,
        stats: graph.stats,
        updatedAt: Date.now(),
      },
    });

    console.log(`✅ [GRAPH STORE COMPLETE]`);
  } catch (error) {
    console.error(`❌ [GRAPH STORE ERROR]:`, error);
    throw error;
  }
}

// ──────────────────────────────────────────────
// Retrieve Graph from Project Document
// ──────────────────────────────────────────────

export async function getGraph(projectId: string): Promise<CodeGraph | null> {
  try {
    const projectRef = db.collection(PROJECTS_COLLECTION).doc(projectId);
    const projectDoc = await projectRef.get();

    if (!projectDoc.exists) {
      return null;
    }

    const data = projectDoc.data();
    if (!data?.graph) {
      return null;
    }

    return {
      projectId,
      nodes: data.graph.nodes || [],
      edges: data.graph.edges || [],
      stats: data.graph.stats || {
        nodeCount: 0,
        edgeCount: 0,
        fileCount: 0,
        functionCount: 0,
        classCount: 0,
      },
    };
  } catch (error) {
    console.error(`❌ [GRAPH RETRIEVE ERROR] Project ${projectId}:`, error);
    return null;
  }
}

// ──────────────────────────────────────────────
// Get Graph Summary (for Dev Inspector)
// ──────────────────────────────────────────────

export async function getGraphSummary(projectId: string): Promise<{
  nodes: number;
  edges: number;
  filesLinked: number;
  functionsDetected: number;
  classesDetected: number;
} | null> {
  try {
    const projectRef = db.collection(PROJECTS_COLLECTION).doc(projectId);
    const projectDoc = await projectRef.get();

    if (!projectDoc.exists) {
      return null;
    }

    const data = projectDoc.data();
    if (!data?.graph?.stats) {
      return null;
    }

    const stats = data.graph.stats;

    return {
      nodes: stats.nodeCount || 0,
      edges: stats.edgeCount || 0,
      filesLinked: stats.fileCount || 0,
      functionsDetected: stats.functionCount || 0,
      classesDetected: stats.classCount || 0,
    };
  } catch (error) {
    console.error(`❌ [GRAPH SUMMARY ERROR] Project ${projectId}:`, error);
    return null;
  }
}

// ──────────────────────────────────────────────
// Delete Graph (cleanup - not needed with document field)
// ──────────────────────────────────────────────

export async function deleteGraph(projectId: string): Promise<void> {
  try {
    console.log(`🗑️  [GRAPH DELETE] Removing graph field for project: ${projectId}`);

    const projectRef = db.collection(PROJECTS_COLLECTION).doc(projectId);

    // Remove graph field from project document
    await projectRef.update({
      graph: null,
    });

    console.log(`✅ [GRAPH DELETE COMPLETE]`);
  } catch (error) {
    console.error(`❌ [GRAPH DELETE ERROR]:`, error);
    // Don't throw - graph deletion should not fail project deletion
  }
}
