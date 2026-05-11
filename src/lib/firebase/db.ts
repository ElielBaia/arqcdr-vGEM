import { collection, doc, setDoc, getDocs, updateDoc, serverTimestamp, getDoc, query, where } from 'firebase/firestore';
import { db, auth, OperationType, handleFirestoreError } from './config';
import { PBIMProject } from '../pbim/schema';

export async function savePBIMProject(project: PBIMProject): Promise<void> {
    if (!auth.currentUser) throw new Error("Must be logged in to save.");
    
    const projectId = project.project_id;
    const path = `projects/${projectId}`;
    const docRef = doc(db, 'projects', projectId);

    try {
        const existing = await getDoc(docRef);
        if (existing.exists()) {
             await updateDoc(docRef, {
                 name: project.name || 'Unnamed Project',
                 projectData: project,
                 updatedAt: serverTimestamp()
             });
        } else {
             await setDoc(docRef, {
                 userId: auth.currentUser.uid,
                 name: project.name || 'Unnamed Project',
                 projectData: project,
                 createdAt: serverTimestamp(),
                 updatedAt: serverTimestamp()
             });
        }
    } catch (error) {
        handleFirestoreError(error, OperationType.WRITE, path);
    }
}

export async function loadMyProjects(): Promise<PBIMProject[]> {
    if (!auth.currentUser) return [];

    const path = `projects`;
    try {
        const q = query(collection(db, 'projects'), where('userId', '==', auth.currentUser.uid));
        const snapshot = await getDocs(q);
        return snapshot.docs.map(doc => doc.data().projectData as PBIMProject);
    } catch (error) {
        handleFirestoreError(error, OperationType.LIST, path);
    }
}
