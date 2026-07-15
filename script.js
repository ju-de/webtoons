// DOM Elements
const searchInput = document.getElementById('searchInput');
const searchBtn = document.getElementById('searchBtn');
const loadingIndicator = document.getElementById('loadingIndicator');
const resultsList = document.getElementById('resultsList');
const libraryList = document.getElementById('libraryList');
const filterOptions = document.querySelectorAll('.filter-checkbox input');

// Event Listeners
searchBtn.addEventListener('click', performSearch);
searchInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') performSearch();
});

filterOptions.forEach(option => {
    option.addEventListener('change', handleFilterChange);
});

// Search Function
async function performSearch() {
    const query = searchInput.value.trim();
    
    if (!query) {
        alert('Please enter a webtoon title');
        return;
    }

    showLoading(true);
    resultsList.innerHTML = '';

    try {
        const selectedPlatforms = getSelectedPlatforms();
        const results = await searchWebtoons(query, selectedPlatforms);
        
        if (results.length === 0) {
            resultsList.innerHTML = '<p class="empty-state">No results found. Try a different search term.</p>';
        } else {
            displayResults(results);
        }
    } catch (error) {
        console.error('Search error:', error);
        resultsList.innerHTML = '<p class="empty-state">Error during search. Please try again.</p>';
    } finally {
        showLoading(false);
    }
}

// Get Selected Platforms
function getSelectedPlatforms() {
    const selected = [];
    filterOptions.forEach(option => {
        if (option.checked && option.value !== 'all') {
            selected.push(option.value);
        }
    });
    return selected.length > 0 ? selected : ['anime-planet', 'atsu', 'kagane', 'comix'];
}

// Handle Filter Change
function handleFilterChange() {
    const allOption = document.querySelector('.filter-checkbox input[value="all"]');
    const otherOptions = document.querySelectorAll('.filter-checkbox input:not([value="all"])');
    
    if (allOption.checked) {
        otherOptions.forEach(opt => opt.checked = false);
    }
}

// Search Webtoons (Mock Implementation)
async function searchWebtoons(query, platforms) {
    // This is a placeholder that creates mock results
    // In production, this would make actual API calls to each platform
    
    const mockResults = [
        {
            title: query,
            source: 'anime-planet',
            url: `https://www.anime-planet.com/manga/all?name=${encodeURIComponent(query)}`,
            description: `Search results for "${query}" on Anime-Planet`
        },
        {
            title: query,
            source: 'atsu',
            url: `https://atsu.moe/?s=${encodeURIComponent(query)}`,
            description: `Search results for "${query}" on Atsu.moe`
        },
        {
            title: query,
            source: 'kagane',
            url: `https://kagane.to/?s=${encodeURIComponent(query)}`,
            description: `Search results for "${query}" on Kagane.to`
        },
        {
            title: query,
            source: 'comix',
            url: `https://comix.to/search?q=${encodeURIComponent(query)}`,
            description: `Search results for "${query}" on Comix.to`
        }
    ];

    // Filter based on selected platforms
    return mockResults.filter(result => 
        platforms.includes(result.source)
    );
}

// Display Results
function displayResults(results) {
    resultsList.innerHTML = results.map(result => `
        <div class="result-card">
            <span class="result-source">${result.source.toUpperCase()}</span>
            <h3>${result.title}</h3>
            <p class="result-description">${result.description}</p>
            <a href="${result.url}" target="_blank" rel="noopener noreferrer" class="result-link">
                Visit Site →
            </a>
        </div>
    `).join('');
}

// Show/Hide Loading
function showLoading(show) {
    loadingIndicator.style.display = show ? 'flex' : 'none';
}

// Initialize Library (Placeholder)
function initializeLibrary() {
    // TODO: Fetch user's anime-planet profile and display library
    // For now, this is a placeholder
    libraryList.innerHTML = '<p class="empty-state">Library integration coming soon. Connect your anime-planet profile to see your reading history.</p>';
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
    initializeLibrary();
    console.log('Webtoon Manager initialized');
});