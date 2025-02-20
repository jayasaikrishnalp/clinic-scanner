document.addEventListener('DOMContentLoaded', () => {
    const takePhotoBtn = document.getElementById('takePhotoBtn');
    const fileInput = document.getElementById('fileInput');
    const imagePreview = document.getElementById('imagePreview');
    const loading = document.getElementById('loading');
    const result = document.getElementById('result');

    // Check if the device supports camera
    if (!('mediaDevices' in navigator && 'getUserMedia' in navigator.mediaDevices)) {
        takePhotoBtn.style.display = 'none';
    }

    takePhotoBtn.addEventListener('click', async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ video: true });
            const video = document.createElement('video');
            const canvas = document.createElement('canvas');
            
            video.srcObject = stream;
            await video.play();

            // Set canvas dimensions to video dimensions
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;

            // Draw video frame to canvas
            canvas.getContext('2d').drawImage(video, 0, 0);

            // Convert canvas to blob
            canvas.toBlob(async (blob) => {
                await processImage(blob);
                stream.getTracks().forEach(track => track.stop());
            }, 'image/jpeg');

        } catch (error) {
            console.error('Error accessing camera:', error);
            result.textContent = 'Error accessing camera. Please try uploading an image instead.';
        }
    });

    fileInput.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (file) {
            await processImage(file);
        }
    });

    async function processImage(imageFile) {
        try {
            const imageUrl = URL.createObjectURL(imageFile);
            imagePreview.src = imageUrl;
            imagePreview.style.display = 'block';

            loading.style.display = 'block';
            const tableBody = document.getElementById('extractedContacts');
            tableBody.innerHTML = '';

            const formData = new FormData();
            formData.append('image', imageFile);

            const response = await fetch('/api/analyze-image', {
                method: 'POST',
                body: formData
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || 'Failed to analyze image');
            }

            const data = await response.json();
            const parsedData = JSON.parse(data.contacts);

            // Set the visit date from the extracted data
            if (parsedData.visit_date) {
                document.getElementById('visitDate').value = formatDate(parsedData.visit_date);
            }

            // Update summary section
            document.querySelector('.summary-section').style.display = 'block';
            document.getElementById('totalPatients').textContent = parsedData.summary.total_patients;
            document.getElementById('totalAmount').textContent = `₹${parsedData.summary.total_amount}`;

            // Show table and buttons
            document.getElementById('recordsTable').style.display = 'table';
            document.getElementById('saveAllBtn').style.display = 'block';
            document.getElementById('editModeBtn').style.display = 'block';

            // Populate table
            parsedData.patients.forEach(patient => {
                const row = document.createElement('tr');
                row.innerHTML = `
                    <td>${patient.clinic_id}</td>
                    <td>${patient.name}</td>
                    <td>${patient.age_sex}</td>
                    <td>${patient.phone}</td>
                    <td>${patient.location}</td>
                    <td>${parsedData.visit_date || ''}</td>
                `;
                tableBody.appendChild(row);
            });

            // Refresh saved records list
            loadSavedRecords();

        } catch (error) {
            console.error('Error processing image:', error);
            alert(`Error analyzing image: ${error.message}`);
        } finally {
            loading.style.display = 'none';
        }
    }

    // Helper function to format date from DD/MM/YY to YYYY-MM-DD
    function formatDate(dateStr) {
        const [day, month, year] = dateStr.split('/');
        const fullYear = year.length === 2 ? '20' + year : year;
        return `${fullYear}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
    }

    // Add event listeners for the new buttons
    document.getElementById('saveAllBtn').addEventListener('click', saveAllRecords);
    document.getElementById('editModeBtn').addEventListener('click', toggleEditMode);

    // Tab functionality
    const tabs = document.querySelectorAll('.tab-btn');
    const tabContents = document.querySelectorAll('.tab-content');

    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            // Remove active class from all tabs and contents
            tabs.forEach(t => t.classList.remove('active'));
            tabContents.forEach(content => content.classList.remove('active'));

            // Add active class to clicked tab and corresponding content
            tab.classList.add('active');
            const tabId = tab.getAttribute('data-tab');
            document.getElementById(`${tabId}-tab`).classList.add('active');
        });
    });

    async function saveAllRecords() {
        const rows = document.querySelectorAll('#extractedContacts tr');
        const visitDate = document.getElementById('visitDate').value;
        
        try {
            for (const row of rows) {
                const cells = row.cells;
                const record = {
                    clinic_id: cells[0].textContent,
                    patient_name: cells[1].textContent,
                    age_sex: cells[2].textContent,
                    phone_number: cells[3].textContent,
                    location: cells[4].textContent,
                    visit_date: visitDate
                };

                console.log('Saving record:', record);

                const response = await fetch('/api/contacts', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(record)
                });

                if (!response.ok) {
                    const errorData = await response.json();
                    throw new Error(errorData.error || 'Failed to save record');
                }
            }
            alert('All records saved successfully!');
            loadSavedRecords();
            // Switch to saved records tab after saving
            tabs.forEach(t => t.classList.remove('active'));
            tabContents.forEach(content => content.classList.remove('active'));
            document.querySelector('[data-tab="saved"]').classList.add('active');
            document.getElementById('saved-tab').classList.add('active');
        } catch (error) {
            console.error('Error saving records:', error);
            alert('Error saving records: ' + error.message);
        }
    }

    function toggleEditMode() {
        const rows = document.querySelectorAll('#extractedContacts tr');
        const isEditing = rows[0]?.classList.contains('editable');

        rows.forEach(row => {
            if (isEditing) {
                // Save the edited values
                const cells = row.cells;
                Array.from(cells).forEach(cell => {
                    cell.textContent = cell.querySelector('input').value;
                });
                row.classList.remove('editable');
            } else {
                // Make cells editable
                const cells = row.cells;
                Array.from(cells).forEach(cell => {
                    const value = cell.textContent;
                    cell.innerHTML = `<input type="text" value="${value}">`;
                });
                row.classList.add('editable');
            }
        });

        const editBtn = document.getElementById('editModeBtn');
        editBtn.textContent = isEditing ? 'Edit Mode' : 'Save Edits';
    }

    function createContactCard(contact, saved = false) {
        const card = document.createElement('div');
        card.className = 'contact-card';
        
        const nameInput = document.createElement('input');
        nameInput.value = contact.name;
        nameInput.placeholder = 'Name';
        
        const phoneInput = document.createElement('input');
        phoneInput.value = contact.phone;
        phoneInput.placeholder = 'Phone Number';
        
        const actions = document.createElement('div');
        actions.className = 'contact-actions';
        
        if (saved) {
            const editBtn = document.createElement('button');
            editBtn.textContent = 'Edit';
            editBtn.className = 'btn-edit';
            editBtn.onclick = () => updateContact(contact.id, nameInput, phoneInput);
            
            const deleteBtn = document.createElement('button');
            deleteBtn.textContent = 'Delete';
            deleteBtn.className = 'btn-delete';
            deleteBtn.onclick = () => deleteContact(contact.id, card);
            
            actions.appendChild(editBtn);
            actions.appendChild(deleteBtn);
        } else {
            const saveBtn = document.createElement('button');
            saveBtn.textContent = 'Save';
            saveBtn.className = 'btn-save';
            saveBtn.onclick = () => saveContact(nameInput.value, phoneInput.value);
            actions.appendChild(saveBtn);
        }
        
        card.appendChild(nameInput);
        card.appendChild(phoneInput);
        card.appendChild(actions);
        
        return card;
    }

    async function loadSavedContacts() {
        try {
            const response = await fetch('/api/contacts');
            const contacts = await response.json();
            
            const savedContactsDiv = document.getElementById('savedContacts');
            savedContactsDiv.innerHTML = '';
            
            contacts.forEach(contact => {
                const contactCard = createContactCard(contact, true);
                savedContactsDiv.appendChild(contactCard);
            });
        } catch (error) {
            console.error('Error loading contacts:', error);
        }
    }

    async function saveContact(name, phone) {
        try {
            const response = await fetch('/api/contacts', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name, phone_number: phone })
            });
            
            if (!response.ok) throw new Error('Failed to save contact');
            loadSavedContacts();
        } catch (error) {
            console.error('Error saving contact:', error);
            alert('Failed to save contact');
        }
    }

    async function updateContact(id, nameInput, phoneInput) {
        try {
            const response = await fetch(`/api/contacts/${id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: nameInput.value,
                    phone_number: phoneInput.value
                })
            });
            
            if (!response.ok) throw new Error('Failed to update contact');
            loadSavedContacts();
        } catch (error) {
            console.error('Error updating contact:', error);
            alert('Failed to update contact');
        }
    }

    async function deleteContact(id, cardElement) {
        if (!confirm('Are you sure you want to delete this contact?')) return;
        
        try {
            const response = await fetch(`/api/contacts/${id}`, {
                method: 'DELETE'
            });
            
            if (!response.ok) throw new Error('Failed to delete contact');
            cardElement.remove();
        } catch (error) {
            console.error('Error deleting contact:', error);
            alert('Failed to delete contact');
        }
    }

    // Load saved records when the page loads
    async function loadSavedRecords(searchTerm = '', searchField = 'all') {
        try {
            const response = await fetch(`/api/contacts?search=${searchTerm}&field=${searchField}`);
            console.log('Loading saved records...');
            const records = await response.json();
            console.log('Received records:', records);
            
            const tbody = document.getElementById('savedRecords');
            tbody.innerHTML = '';
            
            records.forEach(record => {
                const row = document.createElement('tr');
                const visitDate = record.visit_date ? new Date(record.visit_date).toLocaleDateString() : '';
                
                row.innerHTML = `
                    <td>${record.clinic_id || ''}</td>
                    <td>${record.patient_name || ''}</td>
                    <td>${record.age_sex || ''}</td>
                    <td>${record.phone_number || ''}</td>
                    <td>${record.location || ''}</td>
                    <td>${visitDate}</td>
                    <td>
                        <button class="action-btn edit-btn" onclick="editRecord(${record.id})">Edit</button>
                        <button class="action-btn delete-btn" onclick="deleteRecord(${record.id})">Delete</button>
                    </td>
                `;
                tbody.appendChild(row);
            });
        } catch (error) {
            console.error('Error loading records:', error);
            alert('Error loading records');
        }
    }

    // Modal management
    const modal = document.getElementById('recordModal');
    const closeBtn = document.querySelector('.close');
    const recordForm = document.getElementById('recordForm');

    document.getElementById('addNewRecordBtn').onclick = () => {
        document.getElementById('modalTitle').textContent = 'Add New Record';
        document.getElementById('recordId').value = '';
        recordForm.reset();
        modal.style.display = 'block';
    };

    closeBtn.onclick = () => {
        modal.style.display = 'none';
    };

    window.onclick = (event) => {
        if (event.target === modal) {
            modal.style.display = 'none';
        }
    };

    // Form submission
    recordForm.onsubmit = async (e) => {
        e.preventDefault();
        
        const recordId = document.getElementById('recordId').value;
        const record = {
            clinic_id: document.getElementById('clinicId').value,
            patient_name: document.getElementById('patientName').value,
            age_sex: document.getElementById('ageSex').value,
            phone_number: document.getElementById('phone').value,
            location: document.getElementById('location').value,
            visit_date: document.getElementById('modalVisitDate').value
        };

        try {
            const url = recordId ? `/api/contacts/${recordId}` : '/api/contacts';
            const method = recordId ? 'PUT' : 'POST';
            
            const response = await fetch(url, {
                method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(record)
            });

            if (!response.ok) throw new Error('Failed to save record');
            
            modal.style.display = 'none';
            loadSavedRecords();
        } catch (error) {
            console.error('Error saving record:', error);
            alert('Error saving record');
        }
    };

    // Edit record
    async function editRecord(id) {
        try {
            const response = await fetch(`/api/contacts/${id}`);
            const record = await response.json();
            
            document.getElementById('modalTitle').textContent = 'Edit Record';
            document.getElementById('recordId').value = id;
            document.getElementById('clinicId').value = record.clinic_id || '';
            document.getElementById('patientName').value = record.patient_name || '';
            document.getElementById('ageSex').value = record.age_sex || '';
            document.getElementById('phone').value = record.phone_number || '';
            document.getElementById('location').value = record.location || '';
            
            modal.style.display = 'block';
        } catch (error) {
            console.error('Error loading record:', error);
            alert('Error loading record');
        }
    }

    // Search functionality
    const searchInput = document.getElementById('searchInput');
    const searchField = document.getElementById('searchField');

    function handleSearch() {
        const searchTerm = searchInput.value;
        const field = searchField.value;
        loadSavedRecords(searchTerm, field);
    }

    searchInput.addEventListener('input', handleSearch);
    searchField.addEventListener('change', handleSearch);

    // Initialize the page
    loadSavedRecords();
}); 