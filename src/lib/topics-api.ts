import { supabase } from "@/integrations/supabase/client";
import type { Tables, TablesInsert, TablesUpdate } from "@/integrations/supabase/types";

export type Topic = Tables<"topics">;
export type TopicInsert = TablesInsert<"topics">;
export type TopicUpdate = TablesUpdate<"topics">;
export type TopicRelationship = Tables<"topic_relationships">;
export type RelationshipType = TopicRelationship["relationship_type"];

export const RELATIONSHIP_TYPES: RelationshipType[] = ["parent", "child", "related", "supports"];

async function currentUserId() {
  const { data } = await supabase.auth.getUser();
  if (!data.user) throw new Error("Not signed in");
  return data.user.id;
}

export async function listTopics(projectId: string): Promise<Topic[]> {
  const { data, error } = await supabase
    .from("topics")
    .select("*")
    .eq("project_id", projectId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function listRelationships(projectId: string): Promise<TopicRelationship[]> {
  const { data, error } = await supabase
    .from("topic_relationships")
    .select("*")
    .eq("project_id", projectId);
  if (error) throw error;
  return data ?? [];
}

export async function createTopic(input: {
  project_id: string;
  name: string;
  description?: string | null;
  color?: string;
  position_x?: number;
  position_y?: number;
}) {
  const user_id = await currentUserId();
  const { data, error } = await supabase
    .from("topics")
    .insert({ ...input, user_id })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateTopic(id: string, patch: TopicUpdate) {
  const { data, error } = await supabase
    .from("topics")
    .update(patch)
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteTopic(id: string) {
  const { error } = await supabase.from("topics").delete().eq("id", id);
  if (error) throw error;
}

export async function createRelationship(input: {
  project_id: string;
  source_topic_id: string;
  target_topic_id: string;
  relationship_type: RelationshipType;
}) {
  const user_id = await currentUserId();
  const { data, error } = await supabase
    .from("topic_relationships")
    .insert({ ...input, user_id })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteRelationship(id: string) {
  const { error } = await supabase.from("topic_relationships").delete().eq("id", id);
  if (error) throw error;
}
