import React, { useState, useEffect } from 'react';
import { User } from '../types';

interface Props {
  user: User | null;
  onSave: (payload: { name?: string; email?: string; avatar?: string; title?: string; section?: string }) => Promise<User>;
  onClose?: () => void;
}

export const Profile: React.FC<Props> = ({ user, onSave, onClose }) => {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [title, setTitle] = useState('');
  const [section, setSection] = useState('');
  const [avatarPreview, setAvatarPreview] = useState<string>('');
  const [avatarData, setAvatarData] = useState<string>('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setName(user?.name || '');
    setEmail(user?.email || '');
    setTitle((user as any)?.title || '');
    setSection((user as any)?.section || '');
    setAvatarPreview(user?.avatar || 'https://picsum.photos/seed/default/100/100');
  }, [user]);

  const onFile = (f?: File) => {
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || '');
      setAvatarPreview(result);
      setAvatarData(result);
    };
    reader.readAsDataURL(f);
  };

  const handleSave = async () => {
    if (!user) return;
    setSaving(true);
    try {
      const payload: any = { name: name.trim(), email: email.trim().toLowerCase(), title: title.trim(), section: section.trim() };
      if (avatarData) payload.avatar = avatarData;
      const updated = await onSave(payload);
      // parent updates state
      if (onClose) onClose();
    } catch (err) {
      alert((err as any)?.message || 'Failed to save profile');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-6 w-full max-w-3xl mx-auto">
      <h2 className="text-lg font-semibold mb-4">Your Profile</h2>
      <div className="bg-white border rounded-md p-4 space-y-4">
        <div className="flex items-center space-x-4">
          <img src={avatarPreview} alt="avatar" className="h-20 w-20 rounded-full object-cover border" />
          <div>
            <label className="block text-sm font-medium text-gray-700">Change photo</label>
            <input type="file" accept="image/*" onChange={e => onFile(e.target.files?.[0])} className="mt-2" />
            <p className="text-xs text-gray-400 mt-1">PNG/JPEG up to a few MB. Image is stored as data URL.</p>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700">Name</label>
          <input value={name} onChange={e => setName(e.target.value)} className="mt-1 block w-full border rounded-md p-2" />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700">Email</label>
          <input value={email} onChange={e => setEmail(e.target.value)} className="mt-1 block w-full border rounded-md p-2" />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700">Title</label>
          <input value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Senior Engineer" className="mt-1 block w-full border rounded-md p-2" />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700">Section</label>
          <input value={section} onChange={e => setSection(e.target.value)} placeholder="e.g. End User Computing" className="mt-1 block w-full border rounded-md p-2" />
        </div>

        <div className="flex space-x-2 justify-end">
          <button onClick={onClose} className="px-4 py-2 rounded-md border">Cancel</button>
          <button onClick={handleSave} disabled={saving} className="px-4 py-2 rounded-md bg-ots-600 text-white">{saving ? 'Saving...' : 'Save'}</button>
        </div>
      </div>
    </div>
  );
};

export default Profile;
