import { useEffect, useState } from "react";
import { createUnifiedAPI } from "../desktop";
import { httpBaseURL } from "../config";
import { t } from "../i18n";
import { useChatStore } from "../store/chatStore";
import { cli } from "./utils";

type ProfileData = {
  user: { userId: number; username: string; nickname: string; avatarUrl?: string; online?: boolean };
  bio: string;
  gender: number;
  createdAt: string;
  email?: string;
};

export function UserProfileModal({
  username,
  onClose,
  onStartConversation,
}: {
  username: string;
  onClose: () => void;
  onStartConversation?: (username: string) => void;
}) {
  const language = useChatStore((state) => state.language);
  const token = useChatStore((state) => state.token);
  const currentUser = useChatStore((state) => state.currentUser);
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [saveError, setSaveError] = useState("");
  const [saving, setSaving] = useState(false);
  const [nickname, setNickname] = useState("");
  const [bio, setBio] = useState("");
  const [email, setEmail] = useState("");
  const [gender, setGender] = useState(0);

  const isOwn = currentUser?.username === username;

  useEffect(() => {
    cli(() => loadProfile())();
  }, [username]);

  async function loadProfile() {
    if (!token) return;
    try {
      setLoading(true);
      setLoadError("");
      const api = createUnifiedAPI(httpBaseURL);
      const p = await api.getProfile(token, username);
      setProfile(p);
      setNickname(p.user.nickname);
      setBio(p.bio);
      setEmail(p.email ?? "");
      setGender(p.gender);
    } catch (error) {
      setLoadError(
        error instanceof Error ? error.message : t(language, "profile.loadError"),
      );
    } finally {
      setLoading(false);
    }
  }

  async function handleSave() {
    if (!token) return;
    try {
      setSaving(true);
      setSaveError("");
      const api = createUnifiedAPI(httpBaseURL);
      const p = await api.updateProfile(token, username, {
        nickname,
        bio,
        email: email || undefined,
        gender,
      });
      setProfile(p);
      if (isOwn) {
        useChatStore.setState((state) => ({
          currentUser: state.currentUser
            ? { ...state.currentUser, nickname: p.user.nickname }
            : state.currentUser,
        }));
      }
      setEditing(false);
    } catch (error) {
      setSaveError(
        error instanceof Error ? error.message : t(language, "profile.saveError"),
      );
    } finally {
      setSaving(false);
    }
  }

  const genderLabel = (g: number) =>
    g === 1 ? t(language, "profile.genderMale") : g === 2 ? t(language, "profile.genderFemale") : g === 3 ? t(language, "profile.genderOther") : "";

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-panel"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="panel-header">
          <div>
            <p className="section-label">{t(language, "profile.label")}</p>
            <h2>@{username}</h2>
          </div>
          <button
            type="button"
            className="secondary-button compact-button"
            onClick={onClose}
          >
            ×
          </button>
        </header>

        {loading ? (
          <p className="text-muted">{t(language, "profile.loading")}</p>
        ) : loadError ? (
          <div className="callout error" role="alert">
            <span>{loadError}</span>
          </div>
        ) : profile ? (
          editing ? (
            <div className="form-block profile-form">
              {profile.user.avatarUrl && (
                <img
                  src={profile.user.avatarUrl}
                  alt=""
                  className="profile-avatar profile-avatar-small"
                />
              )}
              <label>
                {t(language, "profile.nickname")}
                <input
                  value={nickname}
                  onChange={(e) => setNickname(e.target.value)}
                  disabled={saving}
                />
              </label>
              <label>
                {t(language, "profile.bio")}
                <input
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                  disabled={saving}
                />
              </label>
              <label>
                {t(language, "profile.email")}
                <input
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={saving}
                />
              </label>
              <label>
                {t(language, "profile.gender")}
                <select
                  value={gender}
                  onChange={(e) => setGender(Number(e.target.value))}
                  disabled={saving}
                >
                  <option value={0}>{t(language, "profile.genderUnspecified")}</option>
                  <option value={1}>{t(language, "profile.genderMale")}</option>
                  <option value={2}>{t(language, "profile.genderFemale")}</option>
                  <option value={3}>{t(language, "profile.genderOther")}</option>
                </select>
              </label>
              {saveError ? (
                <div className="callout error" role="alert">
                  <span>{saveError}</span>
                </div>
              ) : null}
              <div className="profile-actions">
                <button
                  type="button"
                  className="primary-button"
                  disabled={saving}
                  onClick={() => handleSave().catch(() => {})}
                >
                  {saving ? t(language, "profile.saving") : t(language, "profile.save")}
                </button>
                <button
                  type="button"
                  className="secondary-button"
                  disabled={saving}
                  onClick={() => setEditing(false)}
                >
                  {t(language, "profile.cancel")}
                </button>
              </div>
            </div>
          ) : (
            <div className="profile-view">
              <div className="profile-hero">
                {profile.user.avatarUrl && (
                  <img
                    src={profile.user.avatarUrl}
                    alt=""
                    className="profile-avatar"
                  />
                )}
                <div className="profile-hero-copy">
                  <div className="profile-hero-headline">
                    <strong>{profile.user.nickname}</strong>
                    <span
                      className={`scope-badge ${
                        profile.user.online ? "scope-badge-live" : ""
                      }`}
                    >
                      {profile.user.online
                        ? t(language, "chat.live")
                        : t(language, "chat.offline")}
                    </span>
                  </div>
                  <span>@{profile.user.username}</span>
                  <small>
                    {t(language, "profile.joined")}{" "}
                    {new Date(profile.createdAt).toLocaleDateString()}
                  </small>
                </div>
              </div>
              <div className="profile-actions">
                {isOwn ? (
                  <button
                    type="button"
                    onClick={() => setEditing(true)}
                    className="secondary-button profile-edit-trigger"
                  >
                    {t(language, "profile.edit")}
                  </button>
                ) : onStartConversation ? (
                  <button
                    type="button"
                    className="primary-button"
                    onClick={() => onStartConversation(username)}
                  >
                    {t(language, "profile.startConversation")}
                  </button>
                ) : null}
              </div>
              {genderLabel(profile.gender) && (
                <div className="profile-field">
                  <span className="text-muted">{t(language, "profile.gender")}</span>
                  <span>{genderLabel(profile.gender)}</span>
                </div>
              )}
              {profile.bio && (
                <div className="profile-field">
                  <p>{profile.bio}</p>
                </div>
              )}
              {isOwn && profile.email && (
                <div className="profile-field">
                  <span className="text-muted">{t(language, "profile.email")}</span>
                  <span>{profile.email}</span>
                </div>
              )}
            </div>
          )
        ) : (
          <p className="text-muted">{t(language, "profile.notFound")}</p>
        )}
      </div>
    </div>
  );
}
